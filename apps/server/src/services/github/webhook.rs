//! What GitHub tells Rustrak: installations coming and going, linked issues
//! closed, reopened, assigned or commented on, and commits pushed.

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use super::{fixes_references, GitHubService};
use crate::db::DbPool;
use crate::error::AppResult;
use crate::models::github::{GitHubApp, RepoCommit};
use crate::services::{IssueService, IssueSocialService, ProjectService};

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
        "push" => push(pool, payload).await,
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
    for link in links {
        IssueService::assign(pool, link.issue_id, user_id, user_id.map(|_| "user")).await?;
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
    let data = json!({
        "text": text(payload, "/comment/body"),
        "source": "github",
        "author": text(payload, "/comment/user/login"),
        "url": text(payload, "/comment/html_url"),
    })
    .to_string();
    for link in
        GitHubService::links_to_remote(pool, text(payload, "/repository/full_name"), number).await?
    {
        IssueSocialService::add_activity(pool, link.issue_id, None, "note", &data).await?;
    }
    Ok(())
}

/// Keeps the commits pushed to a project's default branch, and resolves the
/// issues their messages say they fix.
async fn push(pool: &DbPool, payload: &Value) -> AppResult<()> {
    let repo = text(payload, "/repository/full_name");
    let branch = text(payload, "/ref").trim_start_matches("refs/heads/");
    // The push names the default branch as it is now; the one saved when the
    // project was connected goes stale when someone renames it on GitHub.
    if branch != text(payload, "/repository/default_branch") {
        return Ok(());
    }
    let projects = GitHubService::projects_for_repo(pool, repo).await?;
    if projects.is_empty() {
        return Ok(());
    }
    let mut slugs = Vec::with_capacity(projects.len());
    for repo in &projects {
        let project = ProjectService::get_by_id(pool, repo.project_id).await?;
        slugs.push((project.id, project.slug.to_ascii_uppercase()));
    }
    let projects = slugs;
    let commits = payload
        .get("commits")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for commit in &commits {
        let files: Vec<&str> = ["added", "modified", "removed"]
            .iter()
            .flat_map(|key| {
                commit
                    .get(*key)
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter_map(Value::as_str)
            .collect();
        let saved = RepoCommit {
            repo_full_name: repo.to_string(),
            sha: text(commit, "/id").to_string(),
            message: text(commit, "/message").to_string(),
            author_name: text(commit, "/author/name").to_string(),
            author_login: commit
                .pointer("/author/username")
                .and_then(Value::as_str)
                .map(str::to_string),
            url: text(commit, "/url").to_string(),
            files: json!(files).to_string(),
            committed_at: DateTime::parse_from_rfc3339(text(commit, "/timestamp"))
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        };
        // The commit and everything it resolves commit together: a failure
        // leaves nothing behind for the redelivery to skip, and a redelivered
        // push must not resolve an issue that came back since.
        let mut tx = pool.begin().await?;
        if GitHubService::save_commit(&mut *tx, &saved).await? {
            let resolved = resolve_fixed(&mut tx, &projects, &saved).await?;
            tx.commit().await?;
            for issue_id in resolved {
                super::sync::spawn(
                    "status sync",
                    super::sync::mirror_status(pool.clone(), issue_id),
                );
            }
        }
    }
    Ok(())
}

/// Resolves the issues `commit` says it fixes; `projects` holds each
/// connected project's id and upper-cased slug.
async fn resolve_fixed(
    tx: &mut <crate::db::Db as sqlx::Database>::Connection,
    projects: &[(i32, String)],
    commit: &RepoCommit,
) -> AppResult<Vec<uuid::Uuid>> {
    let mut resolved = Vec::new();
    for (slug, number) in fixes_references(&commit.message) {
        for (project_id, _) in projects.iter().filter(|(_, s)| *s == slug) {
            let issue: Option<(uuid::Uuid,)> = sqlx::query_as(
                "UPDATE issues SET status = $3, substatus = NULL, status_details = '{}'
                 WHERE project_id = $1 AND digest_order = $2 AND status <> $3
                 RETURNING id",
            )
            .bind(project_id)
            .bind(number)
            .bind(crate::models::STATUS_RESOLVED)
            .fetch_optional(&mut *tx)
            .await?;
            let Some((issue_id,)) = issue else {
                continue;
            };
            let data = json!({
                "status": crate::models::STATUS_RESOLVED,
                "source": "github",
                "commit": {
                    "sha": commit.sha,
                    "url": commit.url,
                    "message": commit.message.lines().next().unwrap_or_default(),
                    "author": commit.author_login.as_deref().unwrap_or(&commit.author_name),
                },
            })
            .to_string();
            IssueSocialService::add_activity_on(tx, issue_id, None, "set_status", &data).await?;
            resolved.push(issue_id);
        }
    }
    Ok(resolved)
}
