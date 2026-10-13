//! GitHub integration: storage, the pure rules, and the two-way sync between
//! linked issues.

pub mod client;
pub mod webhook;

use chrono::Utc;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::github::{
    CodeMapping, GitHubApp, GitHubInstallation, ProjectRepository, ProjectRepositoryRow,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webhook_signature_is_checked() {
        let secret = crate::auth::token::generate_token();
        let other = crate::auth::token::generate_token();
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(b"{}");
        let header = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));
        assert!(verify_signature(&secret, b"{}", &header));
        assert!(!verify_signature(&other, b"{}", &header));
        assert!(!verify_signature(&secret, b"{}", "sha1=abc"));
    }
}
