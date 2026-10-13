//! What Rustrak does on GitHub: open and link issues, and mirror status,
//! comments and assignees onto the GitHub issues linked to a Rustrak issue.
//!
//! The mirroring runs off the request path: a slow or unreachable GitHub must
//! never fail or delay the change a person made in Rustrak.

use std::future::Future;

use serde_json::json;
use uuid::Uuid;

use super::client::GitHubClient;
use super::{parse_issue_reference, GitHubService};
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::github::{GitHubApp, IssueLink};
use crate::models::{Issue, Project};
use crate::services::{AlertService, IssueSocialService};

/// Runs a sync in the background and logs, rather than surfaces, a failure.
// ponytail: fire-and-forget, no retry; a durable queue if lost syncs matter.
pub fn spawn<F>(what: &'static str, future: F)
where
    F: Future<Output = AppResult<()>> + Send + 'static,
{
    tokio::spawn(async move {
        if let Err(error) = future.await {
            log::warn!("GitHub {what} failed: {error}");
        }
    });
}

/// The app and the installation that act for a project's repository.
async fn project_installation(
    pool: &DbPool,
    project_id: i32,
) -> AppResult<Option<(GitHubApp, i64, String)>> {
    let Some(app) = GitHubService::app(pool).await? else {
        return Ok(None);
    };
    Ok(GitHubService::project_repository_row(pool, project_id)
        .await?
        .map(|repo| (app, repo.installation_id, repo.repo_full_name)))
}

fn issue_body(project: &Project, issue: &Issue, dashboard_url: &str) -> String {
    let url = AlertService::build_issue_url(dashboard_url, project.id, issue.id);
    let mut body = format!("**{}**", issue.short_id(&project.slug));
    if !issue.culprit.is_empty() {
        body.push_str(&format!(" in `{}`", issue.culprit));
    }
    body.push_str("\n\n");
    if !issue.calculated_value.is_empty() {
        body.push_str(&format!(
            "```\n{}: {}\n```\n\n",
            issue.calculated_type,
            issue
                .calculated_value
                .chars()
                .take(2000)
                .collect::<String>()
        ));
    }
    body.push_str(&format!(
        "{} events since {}.\n\n[Open in Rustrak]({url})",
        issue.digested_event_count,
        issue.first_seen.format("%Y-%m-%d %H:%M UTC")
    ));
    body
}

async fn record_link(
    pool: &DbPool,
    issue_id: Uuid,
    user_id: Option<i32>,
    link: &IssueLink,
    action: &str,
) {
    let data = json!({
        "action": action,
        "repo": link.repo_full_name,
        "number": link.number,
        "title": link.title,
        "url": link.url,
    })
    .to_string();
    if let Err(e) =
        IssueSocialService::add_activity(pool, issue_id, user_id, "github_link", &data).await
    {
        log::warn!("Could not record GitHub link activity: {e}");
    }
}

/// Opens a GitHub issue in the project's repository and links it.
pub async fn create_issue(
    pool: &DbPool,
    project: &Project,
    issue: &Issue,
    title: Option<String>,
    body: Option<String>,
    user_id: Option<i32>,
    dashboard_url: &str,
) -> AppResult<IssueLink> {
    let (app, installation_id, repo) = project_installation(pool, project.id)
        .await?
        .ok_or_else(|| AppError::Validation("This project has no GitHub repository".into()))?;
    let title = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| issue.title());
    let body = body
        .filter(|b| !b.trim().is_empty())
        .unwrap_or_else(|| issue_body(project, issue, dashboard_url));
    let remote = GitHubClient::new(&app)
        .create_issue(installation_id, &repo, &title, &body)
        .await?;
    let link = GitHubService::add_link(pool, issue.id, &repo, &remote).await?;
    record_link(pool, issue.id, user_id, &link, "created").await;
    Ok(link)
}

/// Links an existing GitHub issue or pull request, and leaves a comment on it
/// pointing back, as Sentry does.
pub async fn link_issue(
    pool: &DbPool,
    project: &Project,
    issue: &Issue,
    reference: &str,
    user_id: Option<i32>,
    dashboard_url: &str,
) -> AppResult<IssueLink> {
    let (app, installation_id, project_repo) = project_installation(pool, project.id)
        .await?
        .ok_or_else(|| AppError::Validation("This project has no GitHub repository".into()))?;
    let (repo, number) =
        parse_issue_reference(reference, Some(&project_repo)).ok_or_else(|| {
            AppError::Validation(
                "Use a GitHub issue URL, owner/repo#123, or #123 for this project's repository"
                    .into(),
            )
        })?;
    let client = GitHubClient::new(&app);
    let remote = client.issue(installation_id, &repo, number).await?;
    let link = GitHubService::add_link(pool, issue.id, &repo, &remote).await?;
    record_link(pool, issue.id, user_id, &link, "linked").await;
    let url = AlertService::build_issue_url(dashboard_url, project.id, issue.id);
    let note = format!(
        "Linked to Rustrak issue [{}]({url}).",
        issue.short_id(&project.slug)
    );
    if let Err(e) = client
        .add_comment(installation_id, &repo, number, &note)
        .await
    {
        log::warn!("Could not comment on {repo}#{number}: {e}");
    }
    Ok(link)
}

pub async fn unlink_issue(
    pool: &DbPool,
    issue_id: Uuid,
    link_id: i32,
    user_id: Option<i32>,
) -> AppResult<()> {
    let link = GitHubService::links(pool, issue_id)
        .await?
        .into_iter()
        .find(|l| l.id == link_id)
        .ok_or_else(|| AppError::NotFound(format!("Link {link_id} not found")))?;
    GitHubService::delete_link(pool, issue_id, link_id).await?;
    record_link(pool, issue_id, user_id, &link, "unlinked").await;
    Ok(())
}

/// The links to mirror onto, with the client and installation to use.
async fn mirror_targets(
    pool: &DbPool,
    issue_id: Uuid,
) -> AppResult<Option<(GitHubApp, i64, Vec<IssueLink>)>> {
    let links = GitHubService::links(pool, issue_id).await?;
    if links.is_empty() {
        return Ok(None);
    }
    let issue = crate::services::IssueService::get_by_id(pool, issue_id).await?;
    Ok(project_installation(pool, issue.project_id)
        .await?
        .map(|(app, installation_id, _)| (app, installation_id, links)))
}

/// Closes (or reopens) the linked GitHub issues to match the Rustrak issue's
/// status as it is now. Ignored issues leave GitHub alone.
pub async fn mirror_status(pool: DbPool, issue_id: Uuid) -> AppResult<()> {
    let issue = crate::services::IssueService::get_by_id(&pool, issue_id).await?;
    let state = match issue.status.as_str() {
        crate::models::STATUS_RESOLVED => "closed",
        crate::models::STATUS_UNRESOLVED => "open",
        _ => return Ok(()),
    };
    let Some((app, installation_id, links)) = mirror_targets(&pool, issue_id).await? else {
        return Ok(());
    };
    let client = GitHubClient::new(&app);
    for link in links.iter().filter(|l| l.state != state) {
        client
            .set_issue_state(installation_id, &link.repo_full_name, link.number, state)
            .await?;
        GitHubService::update_remote(&pool, &link.repo_full_name, link.number, &link.title, state)
            .await?;
    }
    Ok(())
}

/// Copies a Rustrak comment onto the linked GitHub issues.
pub async fn mirror_comment(
    pool: DbPool,
    issue_id: Uuid,
    author: String,
    text: String,
) -> AppResult<()> {
    let Some((app, installation_id, links)) = mirror_targets(&pool, issue_id).await? else {
        return Ok(());
    };
    let client = GitHubClient::new(&app);
    let body = format!("**{author}** commented in Rustrak:\n\n{text}");
    for link in &links {
        client
            .add_comment(installation_id, &link.repo_full_name, link.number, &body)
            .await?;
    }
    Ok(())
}

/// Assigns the linked GitHub issues to the Rustrak assignee's GitHub login,
/// or clears them when the issue is unassigned. An assignee without a GitHub
/// login set leaves GitHub alone.
pub async fn mirror_assignee(pool: DbPool, issue_id: Uuid, user_id: Option<i32>) -> AppResult<()> {
    let logins = match user_id {
        Some(user_id) => {
            let login: Option<(Option<String>,)> =
                sqlx::query_as("SELECT github_login FROM users WHERE id = $1")
                    .bind(user_id)
                    .fetch_optional(&pool)
                    .await?;
            match login.and_then(|(l,)| l).filter(|l| !l.is_empty()) {
                Some(login) => vec![login],
                None => return Ok(()),
            }
        }
        None => Vec::new(),
    };
    let Some((app, installation_id, links)) = mirror_targets(&pool, issue_id).await? else {
        return Ok(());
    };
    let client = GitHubClient::new(&app);
    for link in &links {
        client
            .set_assignees(installation_id, &link.repo_full_name, link.number, &logins)
            .await?;
    }
    Ok(())
}
