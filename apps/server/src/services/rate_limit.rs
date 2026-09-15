use chrono::{Duration, Utc};

use crate::config::RateLimitConfig;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::{Installation, Project};

pub struct RateLimitService;

const MAX_QUOTA_REFRESH_ATTEMPTS: usize = 3;

fn is_retryable_quota_refresh(err: &AppError) -> bool {
    #[cfg(feature = "sqlite")]
    {
        matches!(
            err,
            AppError::Database(sqlx::Error::Database(db))
                if db.code().as_deref().is_some_and(is_sqlite_busy_code)
        )
    }
    #[cfg(feature = "postgres")]
    {
        let _ = err;
        false
    }
}

#[cfg(feature = "sqlite")]
fn is_sqlite_busy_code(code: &str) -> bool {
    matches!(code, "5" | "261" | "517" | "773")
}

fn quota_refresh_is_due(digested_count: i64, next_quota_check: i64) -> bool {
    digested_count >= next_quota_check
}

/// The committed event counters and the watermarks that say when each quota
/// row is due for a window scan. Produced by the digest transaction's
/// `RETURNING` and by the rows the ingest path has already loaded, so the
/// post-commit refresh never reads them back.
#[derive(Debug, Clone, Copy)]
pub struct QuotaCounters {
    pub installation_count: i64,
    pub installation_next_check: i64,
    pub project_count: i64,
    pub project_next_check: i64,
}

/// The window start as SQLite stores `events.digested_at`.
///
/// The column is only ever written by its `DEFAULT (datetime('now'))`, i.e.
/// `YYYY-MM-DD HH:MM:SS` in UTC, so a bound in the same shape compares as
/// plain text and the `(project_id, digested_at)` index serves the scan. The
/// previous `datetime(digested_at) >= datetime($1)` form applied a function to
/// the column and forced a full scan of the project's events on every refresh.
/// Dropping the fraction truncates the bound exactly like `datetime()` did.
#[cfg(feature = "sqlite")]
fn sqlite_window_bound(since: chrono::DateTime<Utc>) -> String {
    since.format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Result when quota is exceeded
#[derive(Debug)]
pub struct QuotaExceeded {
    /// Seconds until the quota resets
    pub retry_after: u64,
    /// Which scope triggered the limit (Installation or Project)
    ///
    /// NOTE: Currently unused but kept for future detailed error responses
    /// showing which limit (global vs project) was exceeded.
    #[allow(dead_code)]
    pub scope: QuotaScope,
}

#[derive(Debug)]
pub enum QuotaScope {
    Installation,
    Project,
}

impl RateLimitService {
    /// Gets the installation singleton
    pub async fn get_installation(pool: &DbPool) -> AppResult<Installation> {
        let installation =
            sqlx::query_as::<_, Installation>("SELECT * FROM installation WHERE id = 1")
                .fetch_one(pool)
                .await?;
        Ok(installation)
    }

    /// Checks if quota is exceeded for installation or project (call during ingest)
    /// Returns Some(QuotaExceeded) if rate limited, None if allowed
    ///
    /// `project` is the row the caller has just loaded (the ingest extractor,
    /// or the digest's own lookup): it is read as the project's current quota
    /// state rather than fetched a second time.
    pub async fn check_quota(
        pool: &DbPool,
        project: &Project,
        config: &RateLimitConfig,
    ) -> AppResult<Option<QuotaExceeded>> {
        let now = Utc::now();

        // 1. Check installation (global) quota
        let mut installation = Self::get_installation(pool).await?;
        let mut current_project = std::borrow::Cow::Borrowed(project);
        let project_is_stale = quota_refresh_is_due(
            i64::from(current_project.digested_event_count),
            current_project.next_quota_check,
        );
        let installation_is_stale = quota_refresh_is_due(
            installation.digested_event_count,
            installation.next_quota_check,
        );
        if installation_is_stale || project_is_stale {
            let counters = QuotaCounters {
                installation_count: installation.digested_event_count,
                installation_next_check: installation.next_quota_check,
                project_count: i64::from(current_project.digested_event_count),
                project_next_check: current_project.next_quota_check,
            };
            let mut attempt = 0;
            let refresh = loop {
                match Self::update_quota_state(pool, project.id, config, &counters).await {
                    Err(e)
                        if is_retryable_quota_refresh(&e)
                            && attempt + 1 < MAX_QUOTA_REFRESH_ATTEMPTS =>
                    {
                        tokio::time::sleep(std::time::Duration::from_millis(50 << attempt)).await;
                        attempt += 1;
                    }
                    result => break result,
                }
            };
            match refresh {
                Ok(()) => {
                    installation = Self::get_installation(pool).await?;
                    current_project = std::borrow::Cow::Owned(
                        sqlx::query_as("SELECT * FROM projects WHERE id = $1")
                            .bind(project.id)
                            .fetch_one(pool)
                            .await?,
                    );
                }
                // The refresh is derived bookkeeping; the digest path already
                // treats it as best-effort. Admit or reject on the stale state
                // rather than failing an ingest request nothing else objects to.
                Err(e) => {
                    log::warn!(
                        "quota refresh failed; using stale quota state for this request: {e}"
                    );
                }
            }
        }
        if let Some(until) = installation.quota_exceeded_until {
            if now < until {
                let retry_after = (until - now).num_seconds().max(1) as u64;
                return Ok(Some(QuotaExceeded {
                    retry_after,
                    scope: QuotaScope::Installation,
                }));
            }
        }

        // 2. Check project quota
        if let Some(until) = current_project.quota_exceeded_until {
            if now < until {
                let retry_after = (until - now).num_seconds().max(1) as u64;
                return Ok(Some(QuotaExceeded {
                    retry_after,
                    scope: QuotaScope::Project,
                }));
            }
        }

        Ok(None)
    }

    /// Refreshes derived quota state after digesting an event.
    ///
    /// The counters are already committed by the digest transaction; only the
    /// time-window checks and cached quota fields are updated here. The caller
    /// passes the counters and watermarks it already holds (from the digest's
    /// `RETURNING`, or from the rows it just loaded) so the refresh does not
    /// read the two rows back before deciding whether a window scan is due.
    pub async fn update_quota_state(
        pool: &DbPool,
        project_id: i32,
        config: &RateLimitConfig,
        counters: &QuotaCounters,
    ) -> AppResult<()> {
        let now = Utc::now();

        // The counters are committed already; refresh derived quota rows
        // independently where the backend can benefit from it. SQLite keeps
        // its two writes serial because it has one writer at a time.
        #[cfg(feature = "postgres")]
        tokio::try_join!(
            Self::update_installation_quota(pool, config, now, counters),
            Self::update_project_quota(pool, project_id, config, now, counters),
        )?;

        #[cfg(feature = "sqlite")]
        {
            Self::update_installation_quota(pool, config, now, counters).await?;
            Self::update_project_quota(pool, project_id, config, now, counters).await?;
        }

        Ok(())
    }

    /// Increments both quota counters atomically with the digest transaction.
    /// Returns the committed counters, with the watermarks that decide whether
    /// the post-commit quota refresh has to scan the time windows.
    pub async fn increment_quota_counters(
        executor: &mut <crate::db::Db as sqlx::Database>::Connection,
        project_id: i32,
    ) -> AppResult<QuotaCounters> {
        let (installation_count, installation_next_check): (i64, i64) = sqlx::query_as(
            "UPDATE installation SET digested_event_count = digested_event_count + 1 WHERE id = 1 RETURNING digested_event_count, next_quota_check",
        )
        .fetch_one(&mut *executor)
        .await?;

        let (project_count, project_next_check): (i32, i64) = sqlx::query_as(
            "UPDATE projects SET stored_event_count = stored_event_count + 1, digested_event_count = digested_event_count + 1 WHERE id = $1 RETURNING digested_event_count, next_quota_check",
        )
        .bind(project_id)
        .fetch_one(&mut *executor)
        .await?;

        Ok(QuotaCounters {
            installation_count,
            installation_next_check,
            project_count: i64::from(project_count),
            project_next_check,
        })
    }

    /// Counts events in a time window for the whole installation
    async fn count_global_events_since(
        pool: &DbPool,
        since: chrono::DateTime<Utc>,
    ) -> AppResult<i64> {
        #[cfg(feature = "postgres")]
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events WHERE digested_at >= $1")
            .bind(since)
            .fetch_one(pool)
            .await?;

        #[cfg(feature = "sqlite")]
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events WHERE digested_at >= $1")
            .bind(sqlite_window_bound(since))
            .fetch_one(pool)
            .await?;

        Ok(count)
    }

    /// Counts events in a time window for a specific project
    async fn count_project_events_since(
        pool: &DbPool,
        project_id: i32,
        since: chrono::DateTime<Utc>,
    ) -> AppResult<i64> {
        #[cfg(feature = "postgres")]
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM events WHERE project_id = $1 AND digested_at >= $2",
        )
        .bind(project_id)
        .bind(since)
        .fetch_one(pool)
        .await?;

        #[cfg(feature = "sqlite")]
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM events WHERE project_id = $1 AND digested_at >= $2",
        )
        .bind(project_id)
        .bind(sqlite_window_bound(since))
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    /// Updates installation quota state
    async fn update_installation_quota(
        pool: &DbPool,
        config: &RateLimitConfig,
        now: chrono::DateTime<Utc>,
        counters: &QuotaCounters,
    ) -> AppResult<()> {
        let new_count = counters.installation_count;
        let next_quota_check = counters.installation_next_check;

        // Calculate minimum threshold for optimization
        let min_threshold = config.max_events_per_minute.min(config.max_events_per_hour);

        // Only do expensive COUNT if needed
        let should_check =
            new_count >= next_quota_check || (next_quota_check - new_count) > min_threshold;

        if should_check {
            // Count events in each window (parallel queries)
            let (count_minute, count_hour) = tokio::try_join!(
                Self::count_global_events_since(pool, now - Duration::minutes(1)),
                Self::count_global_events_since(pool, now - Duration::hours(1))
            )?;

            // Check which thresholds are exceeded
            let (exceeded_until, exceeded_reason) = if count_minute + 1
                >= config.max_events_per_minute
            {
                // Exceeded per-minute limit
                let until = now + Duration::minutes(1);
                let reason = serde_json::to_string(&("minute", 1, config.max_events_per_minute))
                    .expect("tuple serialization should not fail");
                (Some(until), Some(reason))
            } else if count_hour + 1 >= config.max_events_per_hour {
                // Exceeded per-hour limit
                let until = now + Duration::hours(1);
                let reason = serde_json::to_string(&("hour", 1, config.max_events_per_hour))
                    .expect("tuple serialization should not fail");
                (Some(until), Some(reason))
            } else {
                (None, None)
            };

            // Calculate when to check again
            let check_again_after = (config.max_events_per_minute - count_minute - 1)
                .min(config.max_events_per_hour - count_hour - 1)
                .max(1);

            sqlx::query(
                r#"
                UPDATE installation
                SET quota_exceeded_until = $1,
                    quota_exceeded_reason = $2,
                    next_quota_check = $3
                WHERE id = 1 AND next_quota_check <= $4
                "#,
            )
            .bind(exceeded_until)
            .bind(exceeded_reason)
            .bind(new_count + check_again_after)
            .bind(new_count)
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    /// Updates project quota state
    async fn update_project_quota(
        pool: &DbPool,
        project_id: i32,
        config: &RateLimitConfig,
        now: chrono::DateTime<Utc>,
        counters: &QuotaCounters,
    ) -> AppResult<()> {
        let new_count = counters.project_count;
        let next_quota_check = counters.project_next_check;

        // Calculate minimum threshold for optimization
        let min_threshold = config
            .max_events_per_project_per_minute
            .min(config.max_events_per_project_per_hour);

        // Only do expensive COUNT if needed
        let should_check =
            new_count >= next_quota_check || (next_quota_check - new_count) > min_threshold;

        if should_check {
            // Count events in each window (parallel queries)
            let (count_minute, count_hour) = tokio::try_join!(
                Self::count_project_events_since(pool, project_id, now - Duration::minutes(1)),
                Self::count_project_events_since(pool, project_id, now - Duration::hours(1))
            )?;

            // Check which thresholds are exceeded
            let (exceeded_until, exceeded_reason) = if count_minute + 1
                >= config.max_events_per_project_per_minute
            {
                let until = now + Duration::minutes(1);
                let reason =
                    serde_json::to_string(&("minute", 1, config.max_events_per_project_per_minute))
                        .expect("tuple serialization should not fail");
                (Some(until), Some(reason))
            } else if count_hour + 1 >= config.max_events_per_project_per_hour {
                let until = now + Duration::hours(1);
                let reason =
                    serde_json::to_string(&("hour", 1, config.max_events_per_project_per_hour))
                        .expect("tuple serialization should not fail");
                (Some(until), Some(reason))
            } else {
                (None, None)
            };

            // Calculate when to check again
            let check_again_after = (config.max_events_per_project_per_minute - count_minute - 1)
                .min(config.max_events_per_project_per_hour - count_hour - 1)
                .max(1);

            sqlx::query(
                r#"
                UPDATE projects
                SET quota_exceeded_until = $2,
                    quota_exceeded_reason = $3,
                    next_quota_check = $4
                WHERE id = $1 AND next_quota_check <= $5
                "#,
            )
            .bind(project_id)
            .bind(exceeded_until)
            .bind(exceeded_reason)
            .bind(new_count + check_again_after)
            .bind(new_count)
            .execute(pool)
            .await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::quota_refresh_is_due;

    #[cfg(feature = "sqlite")]
    use super::is_sqlite_busy_code;

    #[cfg(feature = "sqlite")]
    #[test]
    fn sqlite_busy_codes_are_retryable() {
        let codes = ["5", "261", "517", "773"];
        assert!(codes.into_iter().all(is_sqlite_busy_code));
        assert!(!is_sqlite_busy_code("2067"));
    }

    #[test]
    fn quota_refresh_is_due_handles_initial_and_advanced_watermarks() {
        assert!(quota_refresh_is_due(0, 0) && quota_refresh_is_due(12, 10));
        assert!(!quota_refresh_is_due(9, 10));
    }

    #[cfg(feature = "sqlite")]
    #[test]
    fn sqlite_window_bound_matches_the_default_digested_at_format() {
        use chrono::TimeZone;
        let since = chrono::Utc.with_ymd_and_hms(2026, 9, 14, 23, 4, 5).unwrap()
            + chrono::Duration::milliseconds(789);
        // Same shape as `datetime('now')`: no `T`, no fraction, no offset.
        assert_eq!(super::sqlite_window_bound(since), "2026-09-14 23:04:05");
    }
}
