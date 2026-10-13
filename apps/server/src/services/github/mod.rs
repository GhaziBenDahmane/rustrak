//! GitHub integration: storage, the pure rules, and the two-way sync between
//! linked issues.

pub mod client;
pub mod sync;
pub mod webhook;

use chrono::Utc;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::github::{
    CodeMapping, GitHubApp, GitHubInstallation, IssueLink, ProjectRepository, ProjectRepositoryRow,
};

pub use client::GitHubClient;

pub struct GitHubService;

impl GitHubService {
    // ---------------------------------------------------------------- the app

    pub async fn app(pool: &DbPool) -> AppResult<Option<GitHubApp>> {
        Ok(sqlx::query_as::<_, GitHubApp>(
            r#"SELECT app_id, slug, client_id, client_secret, webhook_secret, private_key,
                      html_url, owner_login, web_url, api_url, last_webhook_at, created_at
               FROM github_app WHERE id = 1"#,
        )
        .fetch_optional(pool)
        .await?)
    }

    /// The app, or the error every GitHub action answers without one.
    pub async fn require_app(pool: &DbPool) -> AppResult<GitHubApp> {
        Self::app(pool).await?.ok_or_else(|| {
            AppError::Validation("GitHub is not connected to this Rustrak instance".into())
        })
    }

    /// Stores the app GitHub created from the manifest, replacing any other.
    pub async fn save_app(pool: &DbPool, app: &GitHubApp) -> AppResult<()> {
        let mut tx = pool.begin().await?;
        sqlx::query("DELETE FROM github_installations")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM github_app")
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            r#"INSERT INTO github_app (id, app_id, slug, client_id, client_secret, webhook_secret,
                                       private_key, html_url, owner_login, web_url, api_url, created_at)
               VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"#,
        )
        .bind(app.app_id)
        .bind(&app.slug)
        .bind(&app.client_id)
        .bind(&app.client_secret)
        .bind(&app.webhook_secret)
        .bind(&app.private_key)
        .bind(&app.html_url)
        .bind(&app.owner_login)
        .bind(&app.web_url)
        .bind(&app.api_url)
        .bind(Utc::now())
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        client::clear_token_cache();
        Ok(())
    }

    /// Forgets the app. Installations and the project repositories that hang
    /// off them go with it; links on issues stay, they are history.
    pub async fn delete_app(pool: &DbPool) -> AppResult<()> {
        let mut tx = pool.begin().await?;
        sqlx::query("DELETE FROM project_repositories")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM github_installations")
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM github_app")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        client::clear_token_cache();
        Ok(())
    }

    pub async fn touch_webhook(pool: &DbPool) -> AppResult<()> {
        sqlx::query("UPDATE github_app SET last_webhook_at = $1 WHERE id = 1")
            .bind(Utc::now())
            .execute(pool)
            .await?;
        Ok(())
    }

    // -------------------------------------------------------- installations

    pub async fn installations(pool: &DbPool) -> AppResult<Vec<GitHubInstallation>> {
        Ok(sqlx::query_as::<_, GitHubInstallation>(
            "SELECT id, account_login, account_type, suspended, created_at
             FROM github_installations ORDER BY account_login",
        )
        .fetch_all(pool)
        .await?)
    }

    pub async fn upsert_installation(
        pool: &DbPool,
        id: i64,
        account_login: &str,
        account_type: &str,
    ) -> AppResult<()> {
        sqlx::query(
            r#"INSERT INTO github_installations (id, account_login, account_type, created_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (id) DO UPDATE SET account_login = EXCLUDED.account_login,
                                              account_type = EXCLUDED.account_type,
                                              suspended = FALSE"#,
        )
        .bind(id)
        .bind(account_login)
        .bind(account_type)
        .bind(Utc::now())
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn set_installation_suspended(
        pool: &DbPool,
        id: i64,
        suspended: bool,
    ) -> AppResult<()> {
        sqlx::query("UPDATE github_installations SET suspended = $2 WHERE id = $1")
            .bind(id)
            .bind(suspended)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete_installation(pool: &DbPool, id: i64) -> AppResult<()> {
        sqlx::query("DELETE FROM project_repositories WHERE installation_id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        sqlx::query("DELETE FROM github_installations WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // ------------------------------------------------- project repositories

    pub async fn project_repository_row(
        pool: &DbPool,
        project_id: i32,
    ) -> AppResult<Option<ProjectRepositoryRow>> {
        Ok(sqlx::query_as::<_, ProjectRepositoryRow>(
            r#"SELECT project_id, installation_id, repo_full_name, default_branch, code_mappings
               FROM project_repositories WHERE project_id = $1"#,
        )
        .bind(project_id)
        .fetch_optional(pool)
        .await?)
    }

    pub async fn project_repository(
        pool: &DbPool,
        project_id: i32,
    ) -> AppResult<Option<ProjectRepository>> {
        let Some(row) = Self::project_repository_row(pool, project_id).await? else {
            return Ok(None);
        };
        let web_url = Self::app(pool)
            .await?
            .map(|app| app.web_url)
            .unwrap_or_else(|| "https://github.com".into());
        Ok(Some(ProjectRepository {
            project_id: row.project_id,
            installation_id: row.installation_id,
            html_url: format!("{web_url}/{}", row.repo_full_name),
            code_mappings: serde_json::from_str(&row.code_mappings).unwrap_or_default(),
            repo_full_name: row.repo_full_name,
            default_branch: row.default_branch,
        }))
    }

    /// Points a project at a repository.
    pub async fn save_project_repository(
        pool: &DbPool,
        project_id: i32,
        installation_id: i64,
        repo_full_name: &str,
        default_branch: &str,
        code_mappings: &[CodeMapping],
    ) -> AppResult<()> {
        let mappings =
            serde_json::to_string(code_mappings).map_err(|e| AppError::Internal(e.to_string()))?;
        sqlx::query(
            r#"INSERT INTO project_repositories
                   (project_id, installation_id, repo_full_name, default_branch, code_mappings,
                    created_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (project_id) DO UPDATE SET
                   installation_id = EXCLUDED.installation_id,
                   default_branch = EXCLUDED.default_branch,
                   code_mappings = EXCLUDED.code_mappings,
                   repo_full_name = EXCLUDED.repo_full_name"#,
        )
        .bind(project_id)
        .bind(installation_id)
        .bind(repo_full_name)
        .bind(default_branch)
        .bind(mappings)
        .bind(Utc::now())
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete_project_repository(pool: &DbPool, project_id: i32) -> AppResult<()> {
        sqlx::query("DELETE FROM project_repositories WHERE project_id = $1")
            .bind(project_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // ---------------------------------------------------------------- links

    pub async fn links(pool: &DbPool, issue_id: Uuid) -> AppResult<Vec<IssueLink>> {
        Ok(sqlx::query_as::<_, IssueLink>(
            "SELECT id, issue_id, repo_full_name, number, title, url, state, created_at
             FROM issue_external_links WHERE issue_id = $1 ORDER BY created_at",
        )
        .bind(issue_id)
        .fetch_all(pool)
        .await?)
    }

    pub async fn add_link(
        pool: &DbPool,
        issue_id: Uuid,
        repo_full_name: &str,
        remote: &client::RemoteIssue,
    ) -> AppResult<IssueLink> {
        let existing: Option<IssueLink> = sqlx::query_as(
            "SELECT id, issue_id, repo_full_name, number, title, url, state, created_at
             FROM issue_external_links
             WHERE issue_id = $1 AND repo_full_name = $2 AND number = $3",
        )
        .bind(issue_id)
        .bind(repo_full_name)
        .bind(remote.number)
        .fetch_optional(pool)
        .await?;
        if existing.is_some() {
            return Err(AppError::Conflict(format!(
                "{repo_full_name}#{} is already linked to this issue",
                remote.number
            )));
        }
        Ok(sqlx::query_as::<_, IssueLink>(
            r#"INSERT INTO issue_external_links (issue_id, repo_full_name, number, title, url, state, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id, issue_id, repo_full_name, number, title, url, state, created_at"#,
        )
        .bind(issue_id)
        .bind(repo_full_name)
        .bind(remote.number)
        .bind(&remote.title)
        .bind(&remote.url)
        .bind(&remote.state)
        .bind(Utc::now())
        .fetch_one(pool)
        .await?)
    }

    pub async fn delete_link(pool: &DbPool, issue_id: Uuid, link_id: i32) -> AppResult<()> {
        let result =
            sqlx::query("DELETE FROM issue_external_links WHERE id = $1 AND issue_id = $2")
                .bind(link_id)
                .bind(issue_id)
                .execute(pool)
                .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("Link {link_id} not found")));
        }
        Ok(())
    }

    /// The Rustrak issues linked to one GitHub issue.
    pub async fn links_to_remote(
        pool: &DbPool,
        repo_full_name: &str,
        number: i64,
    ) -> AppResult<Vec<IssueLink>> {
        Ok(sqlx::query_as::<_, IssueLink>(
            "SELECT id, issue_id, repo_full_name, number, title, url, state, created_at
             FROM issue_external_links WHERE LOWER(repo_full_name) = LOWER($1) AND number = $2",
        )
        .bind(repo_full_name)
        .bind(number)
        .fetch_all(pool)
        .await?)
    }

    pub async fn update_remote(
        pool: &DbPool,
        repo_full_name: &str,
        number: i64,
        title: &str,
        state: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "UPDATE issue_external_links SET title = $3, state = $4
             WHERE LOWER(repo_full_name) = LOWER($1) AND number = $2",
        )
        .bind(repo_full_name)
        .bind(number)
        .bind(title)
        .bind(state)
        .execute(pool)
        .await?;
        Ok(())
    }

    // -------------------------------------------------------------- commits
}

// ------------------------------------------------------------- pure rules

/// Verifies `X-Hub-Signature-256` (`sha256=<hex>`) in constant time.
pub fn verify_signature(secret: &str, body: &[u8], header: &str) -> bool {
    let Some(hex_signature) = header.strip_prefix("sha256=") else {
        return false;
    };
    let Ok(expected) = hex::decode(hex_signature) else {
        return false;
    };
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC takes a key of any size");
    mac.update(body);
    mac.verify_slice(&expected).is_ok()
}

/// A GitHub issue reference: a full issue or pull request URL, `owner/repo#12`,
/// or `#12` in `default_repo`.
pub fn parse_issue_reference(reference: &str, default_repo: Option<&str>) -> Option<(String, i64)> {
    let reference = reference.trim();
    if let Some(number) = reference.strip_prefix('#') {
        return Some((default_repo?.to_string(), number.parse().ok()?));
    }
    if let Some((repo, number)) = reference.split_once('#') {
        if repo.split('/').count() == 2 {
            return Some((repo.to_string(), number.parse().ok()?));
        }
    }
    let url = url::Url::parse(reference).ok()?;
    let segments: Vec<&str> = url.path_segments()?.filter(|s| !s.is_empty()).collect();
    match segments.as_slice() {
        [owner, repo, "issues" | "pull", number, ..] => {
            Some((format!("{owner}/{repo}"), number.parse().ok()?))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_references_take_urls_and_shorthand() {
        assert_eq!(
            parse_issue_reference("https://github.com/o/r/issues/12", None),
            Some(("o/r".into(), 12))
        );
        assert_eq!(
            parse_issue_reference("https://github.com/o/r/pull/7/files", None),
            Some(("o/r".into(), 7))
        );
        assert_eq!(
            parse_issue_reference("o/r#3", None),
            Some(("o/r".into(), 3))
        );
        assert_eq!(
            parse_issue_reference("#4", Some("a/b")),
            Some(("a/b".into(), 4))
        );
        assert_eq!(parse_issue_reference("#4", None), None);
        assert_eq!(parse_issue_reference("nonsense", Some("a/b")), None);
    }

    #[test]
    fn webhook_signature_is_checked() {
        let mut mac = Hmac::<Sha256>::new_from_slice(b"secret").unwrap();
        mac.update(b"{}");
        let header = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));
        assert!(verify_signature("secret", b"{}", &header));
        assert!(!verify_signature("other", b"{}", &header));
        assert!(!verify_signature("secret", b"{}", "sha1=abc"));
    }
}
