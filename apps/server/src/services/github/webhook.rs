//! What GitHub tells Rustrak: installations coming and going.

use serde_json::Value;

use super::GitHubService;
use crate::db::DbPool;
use crate::error::AppResult;
use crate::models::github::GitHubApp;

fn text<'a>(value: &'a Value, pointer: &str) -> &'a str {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .unwrap_or_default()
}

pub async fn handle(pool: &DbPool, app: &GitHubApp, event: &str, payload: &Value) -> AppResult<()> {
    GitHubService::touch_webhook(pool).await?;
    // What Rustrak did on GitHub comes back as the app's bot; it is already here.
    if text(payload, "/sender/login") == format!("{}[bot]", app.slug) {
        return Ok(());
    }
    match event {
        "installation" => installation(pool, payload).await,
        _ => Ok(()),
    }
}

async fn installation(pool: &DbPool, payload: &Value) -> AppResult<()> {
    let Some(id) = payload.pointer("/installation/id").and_then(Value::as_i64) else {
        return Ok(());
    };
    match text(payload, "/action") {
        "deleted" => GitHubService::delete_installation(pool, id).await,
        "suspend" => GitHubService::set_installation_suspended(pool, id, true).await,
        "unsuspend" => GitHubService::set_installation_suspended(pool, id, false).await,
        "created" => {
            GitHubService::upsert_installation(
                pool,
                id,
                text(payload, "/installation/account/login"),
                text(payload, "/installation/account/type"),
            )
            .await
        }
        _ => Ok(()),
    }
}
