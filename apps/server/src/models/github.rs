//! GitHub integration: the instance's GitHub App, its installations, the
//! repository a project points at, and what links issues to GitHub.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// The instance's one GitHub App, as GitHub returned it from the manifest flow.
/// Secrets never leave the server: [`GitHubAppInfo`] is what the API answers.
#[derive(Debug, Clone, FromRow)]
pub struct GitHubApp {
    pub app_id: i64,
    pub slug: String,
    pub client_id: String,
    pub client_secret: String,
    pub webhook_secret: String,
    pub private_key: String,
    pub html_url: String,
    pub owner_login: String,
    /// `https://github.com`, or a GitHub Enterprise Server address.
    pub web_url: String,
    /// `https://api.github.com`, or `<web_url>/api/v3`.
    pub api_url: String,
    pub last_webhook_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct GitHubAppInfo {
    pub app_id: i64,
    pub slug: String,
    pub html_url: String,
    pub owner_login: String,
    /// Where people install the app on an account or organization.
    pub install_url: String,
    pub last_webhook_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl From<&GitHubApp> for GitHubAppInfo {
    fn from(app: &GitHubApp) -> Self {
        Self {
            app_id: app.app_id,
            slug: app.slug.clone(),
            html_url: app.html_url.clone(),
            owner_login: app.owner_login.clone(),
            install_url: format!("{}/apps/{}/installations/new", app.web_url, app.slug),
            last_webhook_at: app.last_webhook_at,
            created_at: app.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct GitHubInstallation {
    pub id: i64,
    pub account_login: String,
    pub account_type: String,
    pub suspended: bool,
    pub created_at: DateTime<Utc>,
}

/// `GET /api/github`: everything the integrations page needs in one answer.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct GitHubStatus {
    pub app: Option<GitHubAppInfo>,
    pub installations: Vec<GitHubInstallation>,
    /// The address GitHub delivers webhooks to.
    pub webhook_url: String,
}

/// Maps a path as it appears in a stack trace to the path in the repository.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct CodeMapping {
    /// Prefix stripped from the frame's path, e.g. `/app/` or `webpack:///./`.
    pub stack_root: String,
    /// Prefix put in its place, e.g. `src/`. Empty for the repository root.
    pub source_root: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct ProjectRepositoryRow {
    pub project_id: i32,
    pub installation_id: i64,
    pub repo_full_name: String,
    pub default_branch: String,
    pub code_mappings: String,
    pub codeowners: Option<String>,
    pub codeowners_synced_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct ProjectRepository {
    pub project_id: i32,
    pub installation_id: i64,
    pub repo_full_name: String,
    pub default_branch: String,
    pub html_url: String,
    pub code_mappings: Vec<CodeMapping>,
    /// How many ownership rules the last CODEOWNERS sync found; `None` before
    /// the first sync.
    pub codeowners_rules: Option<usize>,
    pub codeowners_synced_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct UpdateProjectRepository {
    pub installation_id: i64,
    pub repo_full_name: String,
    #[serde(default)]
    pub code_mappings: Option<Vec<CodeMapping>>,
}

/// A repository an installation can reach.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct GitHubRepository {
    pub installation_id: i64,
    pub full_name: String,
    pub default_branch: String,
    pub private: bool,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct IssueLink {
    pub id: i32,
    pub issue_id: Uuid,
    pub repo_full_name: String,
    pub number: i64,
    pub title: String,
    pub url: String,
    /// `open` or `closed`, as of the last webhook or sync.
    pub state: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct RepoCommit {
    pub repo_full_name: String,
    pub sha: String,
    pub message: String,
    pub author_name: String,
    pub author_login: Option<String>,
    pub url: String,
    #[serde(skip)]
    pub files: String,
    pub committed_at: DateTime<Utc>,
}

/// `GET .../issues/{id}/github`: the issue's "Code" block in one answer.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct IssueGitHub {
    pub links: Vec<IssueLink>,
    /// Commits that touched the issue's culprit file shortly before it first
    /// appeared, newest first.
    pub suspect_commits: Vec<RepoCommit>,
    /// Owners of the culprit file according to CODEOWNERS.
    pub owners: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct CreateGitHubIssue {
    /// Defaults to the Rustrak issue's title.
    #[serde(default)]
    pub title: Option<String>,
    /// Defaults to a summary with the culprit and a link back.
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct LinkGitHubIssue {
    /// A GitHub issue or pull request URL, or `#123` for the project's
    /// repository.
    pub reference: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct ManifestRequest {
    /// Create the app under this organization instead of the user's account.
    #[serde(default)]
    pub organization: Option<String>,
}

/// What the dashboard posts to GitHub to create the app.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct ManifestResponse {
    /// The form's `action`.
    pub action_url: String,
    /// The form's one field, `manifest`.
    pub manifest: String,
}
