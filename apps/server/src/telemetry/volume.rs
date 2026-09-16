//! How much the installation holds. Seven counts, each blurred before it
//! leaves, run once per window off the request path.

use crate::db::DbPool;
use crate::error::AppResult;

use super::{blur_count, Volume};

impl Volume {
    pub async fn collect(pool: &DbPool) -> AppResult<Self> {
        Ok(Self {
            projects: count(pool, "SELECT COUNT(*) FROM projects").await?,
            users: count(pool, "SELECT COUNT(*) FROM users").await?,
            issues_open: count(
                pool,
                "SELECT COUNT(*) FROM issues WHERE status = 'unresolved'",
            )
            .await?,
            events_24h: count(pool, &last_day("events", "ingested_at")).await?,
            transactions_24h: count(pool, &last_day("transactions", "timestamp")).await?,
            sessions_24h: count(
                pool,
                &format!(
                    "SELECT CAST(COALESCE(SUM(total), 0) AS BIGINT) FROM session_counts WHERE {}",
                    since_last_day("bucket")
                ),
            )
            .await?,
            logs_24h: count(pool, &last_day("logs", "ingested_at")).await?,
        })
    }
}

async fn count(pool: &DbPool, sql: &str) -> AppResult<u64> {
    // Every string here is assembled from literals above; nothing user-supplied.
    let n: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .fetch_one(pool)
        .await?;
    Ok(blur_count(n.max(0) as u64))
}

fn last_day(table: &str, column: &str) -> String {
    format!(
        "SELECT COUNT(*) FROM {table} WHERE {}",
        since_last_day(column)
    )
}

/// The dialect-specific "in the last 24 hours" predicate. SQLite stores the
/// timestamps as TEXT, so both sides go through `datetime()`.
fn since_last_day(column: &str) -> String {
    #[cfg(feature = "postgres")]
    {
        format!("{column} >= NOW() - '24 hours'::interval")
    }
    #[cfg(not(feature = "postgres"))]
    {
        format!("datetime({column}) >= datetime('now', '-24 hours')")
    }
}

/// The kinds of alert channel switched on, sorted and deduplicated.
pub async fn alert_providers(pool: &DbPool) -> AppResult<Vec<String>> {
    let kinds: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT provider_type FROM alert_integrations WHERE is_enabled = TRUE ORDER BY provider_type",
    )
    .fetch_all(pool)
    .await?;
    Ok(kinds)
}
