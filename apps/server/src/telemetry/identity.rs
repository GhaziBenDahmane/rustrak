//! The id an installation reports under: a UUIDv4 minted on first use and
//! kept in the `installation` row, so restarts and upgrades stay one instance.

use crate::db::DbPool;
use crate::error::AppResult;

pub async fn instance_id(pool: &DbPool) -> AppResult<String> {
    if let Some(id) = read(pool).await? {
        return Ok(id);
    }
    // Only the first writer wins; a concurrent boot reads what it stored.
    sqlx::query("UPDATE installation SET telemetry_id = $1 WHERE id = 1 AND telemetry_id IS NULL")
        .bind(uuid::Uuid::new_v4().to_string())
        .execute(pool)
        .await?;
    read(pool)
        .await?
        .ok_or_else(|| crate::error::AppError::Internal("installation row is missing".into()))
}

async fn read(pool: &DbPool) -> AppResult<Option<String>> {
    let id: Option<String> =
        sqlx::query_scalar("SELECT telemetry_id FROM installation WHERE id = 1")
            .fetch_one(pool)
            .await?;
    Ok(id)
}
