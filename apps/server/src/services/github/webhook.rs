//! What GitHub tells Rustrak: installations coming and going, and linked
//! issues closed, reopened, assigned or commented on.

use serde_json::{json, Value};

use super::GitHubService;
use crate::db::DbPool;
use crate::error::AppResult;
use crate::models::github::GitHubApp;
use crate::services::{IssueService, IssueSocialService};

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
        "issues" => issues(pool, payload).await,
        "issue_comment" => issue_comment(pool, payload).await,
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

async fn issues(pool: &DbPool, payload: &Value) -> AppResult<()> {
    let repo = text(payload, "/repository/full_name");
    let Some(number) = payload.pointer("/issue/number").and_then(Value::as_i64) else {
        return Ok(());
    };
    let links = GitHubService::links_to_remote(pool, repo, number).await?;
    if links.is_empty() {
        return Ok(());
    }
    GitHubService::update_remote(
        pool,
        repo,
        number,
        text(payload, "/issue/title"),
        text(payload, "/issue/state"),
    )
    .await?;
    let status = match text(payload, "/action") {
        "closed" => crate::models::STATUS_RESOLVED,
        "reopened" => crate::models::STATUS_UNRESOLVED,
        "assigned" | "unassigned" => return assignee(pool, payload, &links).await,
        _ => return Ok(()),
    };
    let data = json!({
        "status": status,
        "source": "github",
        "author": text(payload, "/sender/login"),
        "url": text(payload, "/issue/html_url"),
    })
    .to_string();
    for link in links {
        let issue = IssueService::get_by_id(pool, link.issue_id).await?;
        if issue.status != status {
            IssueService::set_status(pool, issue.id, status, None).await?;
            IssueSocialService::add_activity(pool, issue.id, None, "set_status", &data).await?;
            // Its other GitHub issues follow; this one already has the state.
            super::sync::spawn(
                "status sync",
                super::sync::mirror_status(pool.clone(), issue.id),
            );
        }
    }
    Ok(())
}

/// Follows the GitHub issue's assignees as they are now, not the one that
/// changed, as Sentry does: GitHub issues can have several, so the first one
/// becomes the Rustrak assignee and only an empty list clears it. A first
/// assignee nobody in Rustrak claims leaves the Rustrak issue as it is.
async fn assignee(
    pool: &DbPool,
    payload: &Value,
    links: &[crate::models::github::IssueLink],
) -> AppResult<()> {
    let first = text(payload, "/issue/assignees/0/login");
    let user_id = if first.is_empty() {
        None
    } else {
        let found: Option<(i32,)> =
            sqlx::query_as("SELECT id FROM users WHERE LOWER(github_login) = LOWER($1)")
                .bind(first)
                .fetch_optional(pool)
                .await?;
        match found {
            Some((id,)) => Some(id),
            None => return Ok(()),
        }
    };
    let remote = (
        text(payload, "/repository/full_name").to_string(),
        payload
            .pointer("/issue/number")
            .and_then(Value::as_i64)
            .unwrap_or_default(),
    );
    for link in links {
        IssueService::assign(pool, link.issue_id, user_id, user_id.map(|_| "user")).await?;
        // Its other GitHub issues follow. Not this one: it may have more
        // assignees than the one Rustrak keeps.
        super::sync::spawn(
            "assignee sync",
            super::sync::mirror_assignee(
                pool.clone(),
                link.issue_id,
                user_id,
                Some(remote.clone()),
            ),
        );
    }
    Ok(())
}

async fn issue_comment(pool: &DbPool, payload: &Value) -> AppResult<()> {
    if text(payload, "/action") != "created" {
        return Ok(());
    }
    let Some(number) = payload.pointer("/issue/number").and_then(Value::as_i64) else {
        return Ok(());
    };
    let url = text(payload, "/comment/html_url");
    let data = json!({
        "text": text(payload, "/comment/body"),
        "source": "github",
        "author": text(payload, "/comment/user/login"),
        "url": url,
    })
    .to_string();
    // GitHub redelivers webhooks, and a comment's URL is its own: one already
    // copied is not copied again. Looked for as the stored JSON writes it,
    // with `!` escaping what LIKE would read as a pattern.
    let stored_url = format!(r#""url":{}"#, json!(url))
        .replace('!', "!!")
        .replace('%', "!%")
        .replace('_', "!_");
    for link in
        GitHubService::links_to_remote(pool, text(payload, "/repository/full_name"), number).await?
    {
        let copied: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM issue_activity WHERE issue_id = $1 AND type = 'note' AND data LIKE $2 ESCAPE '!')",
        )
        .bind(link.issue_id)
        .bind(format!("%{stored_url}%"))
        .fetch_one(pool)
        .await?;
        if !url.is_empty() && copied {
            continue;
        }
        IssueSocialService::add_activity(pool, link.issue_id, None, "note", &data).await?;
    }
    Ok(())
}
