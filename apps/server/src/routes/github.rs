//! GitHub integration routes: connecting the instance's GitHub App, pointing a
//! project at a repository, linking issues, and GitHub's webhooks.

use actix_session::Session;
use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::ApiActor;
use crate::config::Config;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::github::{
    GitHubApp, GitHubAppInfo, GitHubStatus, ManifestRequest, ManifestResponse,
    UpdateProjectRepository,
};
use crate::services::access::{self, Action};
use crate::services::github::{client, GitHubClient, GitHubService};

const WEB_URL: &str = "https://github.com";
const STATE_KEY: &str = "github_manifest_state";

fn require_admin(actor: &ApiActor) -> AppResult<()> {
    if actor.is_admin() {
        Ok(())
    } else {
        Err(AppError::Forbidden(
            "Admin privileges required to manage GitHub".to_string(),
        ))
    }
}

/// The address GitHub's webhooks reach this server at: `PUBLIC_URL`, else the
/// bind address. Never the request's `Host`, which the client controls.
fn public_base(config: &Config) -> String {
    config
        .public_url
        .clone()
        .unwrap_or_else(|| format!("http://{}:{}", config.host, config.port))
}

fn redirect(location: &str) -> HttpResponse {
    HttpResponse::Found()
        .insert_header(("Location", location))
        .finish()
}

#[cfg_attr(feature = "openapi", utoipa::path(
    get,
    path = "/api/github",
    tag = "GitHub",
    responses(
        (status = 200, description = "GitHub App and installations", body = GitHubStatus),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// GET /api/github
pub async fn status(
    pool: web::Data<DbPool>,
    config: web::Data<Config>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    require_admin(&actor)?;
    let app = GitHubService::app(pool.get_ref()).await?;
    Ok(HttpResponse::Ok().json(GitHubStatus {
        app: app.as_ref().map(GitHubAppInfo::from),
        installations: GitHubService::installations(pool.get_ref()).await?,
        webhook_url: format!("{}/api/github/webhook", public_base(&config)),
    }))
}

#[cfg_attr(feature = "openapi", utoipa::path(
    delete,
    path = "/api/github",
    tag = "GitHub",
    responses(
        (status = 204, description = "GitHub App removed"),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// DELETE /api/github
pub async fn disconnect(pool: web::Data<DbPool>, actor: ApiActor) -> AppResult<HttpResponse> {
    require_admin(&actor)?;
    GitHubService::delete_app(pool.get_ref()).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[cfg_attr(feature = "openapi", utoipa::path(
    post,
    path = "/api/github/manifest",
    tag = "GitHub",
    request_body = ManifestRequest,
    responses(
        (status = 200, description = "Form to post to GitHub", body = ManifestResponse),
        (status = 400, description = "Invalid request", body = crate::error::ErrorResponse),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// POST /api/github/manifest: what the dashboard posts to GitHub so GitHub
/// creates an app already configured for this server.
pub async fn manifest(
    config: web::Data<Config>,
    session: Session,
    body: web::Json<ManifestRequest>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    require_admin(&actor)?;
    let base = public_base(&config);
    // The browser comes back to the dashboard's host, where the session
    // cookie lives; only the webhook goes to PUBLIC_URL.
    let browser = config.dashboard_url();
    let state = crate::auth::token::generate_token();
    session
        .insert(STATE_KEY, &state)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let action_url = match body.organization.as_deref().filter(|o| !o.is_empty()) {
        Some(org) if org.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') => {
            format!("{WEB_URL}/organizations/{org}/settings/apps/new?state={state}")
        }
        Some(_) => return Err(AppError::Validation("Invalid organization name".into())),
        None => format!("{WEB_URL}/settings/apps/new?state={state}"),
    };
    let host = browser.split("://").nth(1).unwrap_or(&browser);
    let manifest = json!({
        // GitHub caps app names at 34 characters; people can rename it on the form.
        "name": format!("Rustrak {host}").chars().take(34).collect::<String>(),
        "url": browser,
        "hook_attributes": { "url": format!("{base}/api/github/webhook") },
        "redirect_url": format!("{browser}/api/github/callback"),
        "setup_url": format!("{browser}/api/github/installed"),
        "setup_on_update": true,
        "public": false,
        "default_permissions": { "issues": "write", "contents": "read", "metadata": "read" },
        "default_events": ["issues", "issue_comment", "push"],
    });
    Ok(HttpResponse::Ok().json(ManifestResponse {
        action_url,
        manifest: manifest.to_string(),
    }))
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: String,
    state: String,
}

#[cfg_attr(feature = "openapi", utoipa::path(
    get,
    path = "/api/github/callback",
    tag = "GitHub",
    params(
        ("code" = String, Query, description = "Manifest code from GitHub"),
        ("state" = String, Query, description = "State issued by the manifest step"),
    ),
    responses(
        (status = 302, description = "Browser redirect to the integrations page"),
        (status = 400, description = "Invalid request", body = crate::error::ErrorResponse),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// GET /api/github/callback: GitHub sends the browser here after creating the
/// app; the code trades for its credentials.
pub async fn callback(
    pool: web::Data<DbPool>,
    session: Session,
    query: web::Query<CallbackQuery>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    require_admin(&actor)?;
    let expected: Option<String> = session.remove_as(STATE_KEY).and_then(Result::ok);
    if expected.as_deref() != Some(query.state.as_str()) {
        return Err(AppError::Validation(
            "This GitHub callback does not match a setup started here".into(),
        ));
    }
    let api_url =
        std::env::var("GITHUB_API_URL").unwrap_or_else(|_| "https://api.github.com".into());
    let created = client::convert_manifest(&api_url, &query.code).await?;
    let text = |key: &str| {
        created
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    GitHubService::save_app(
        pool.get_ref(),
        &GitHubApp {
            app_id: created
                .get("id")
                .and_then(Value::as_i64)
                .unwrap_or_default(),
            slug: text("slug"),
            client_id: text("client_id"),
            client_secret: text("client_secret"),
            webhook_secret: text("webhook_secret"),
            private_key: text("pem"),
            html_url: text("html_url"),
            owner_login: created
                .pointer("/owner/login")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            web_url: WEB_URL.into(),
            api_url,
            last_webhook_at: None,
            created_at: Utc::now(),
        },
    )
    .await?;
    Ok(redirect("/settings/integrations?github=connected"))
}

#[derive(Deserialize)]
pub struct InstalledQuery {
    installation_id: i64,
}

#[cfg_attr(feature = "openapi", utoipa::path(
    get,
    path = "/api/github/installed",
    tag = "GitHub",
    params(
        ("installation_id" = i64, Query, description = "GitHub installation ID"),
    ),
    responses(
        (status = 302, description = "Browser redirect to the integrations page"),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
        (status = 404, description = "Not found", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// GET /api/github/installed: GitHub sends the browser here after the app is
/// installed on an account.
pub async fn installed(
    pool: web::Data<DbPool>,
    query: web::Query<InstalledQuery>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    require_admin(&actor)?;
    let app = GitHubService::require_app(pool.get_ref()).await?;
    let (login, account_type) = GitHubClient::new(&app)
        .installation_account(query.installation_id)
        .await?;
    GitHubService::upsert_installation(
        pool.get_ref(),
        query.installation_id,
        &login,
        &account_type,
    )
    .await?;
    Ok(redirect("/settings/integrations?github=installed"))
}

#[derive(Deserialize)]
pub struct RepositoriesQuery {
    project_id: i32,
}

#[cfg_attr(feature = "openapi", utoipa::path(
    get,
    path = "/api/github/repositories",
    tag = "GitHub",
    params(
        ("project_id" = i32, Query, description = "Project ID"),
    ),
    responses(
        (status = 200, description = "Repositories the installations reach", body = Vec<crate::models::github::GitHubRepository>),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
        (status = 404, description = "Not found", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// GET /api/github/repositories?project_id=: the repositories a project can
/// point at, for whoever may change that project's settings.
pub async fn repositories(
    pool: web::Data<DbPool>,
    query: web::Query<RepositoriesQuery>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    access::require(
        pool.get_ref(),
        actor.is_admin(),
        actor.user_id(),
        query.project_id,
        Action::UpdateProject,
    )
    .await?;
    let app = GitHubService::require_app(pool.get_ref()).await?;
    let client = GitHubClient::new(&app);
    let mut repositories = Vec::new();
    for installation in GitHubService::installations(pool.get_ref()).await? {
        if installation.suspended {
            continue;
        }
        // One installation GitHub no longer has (its `deleted` webhook lost)
        // must not hide every other installation's repositories.
        match client.repositories(installation.id).await {
            Ok(found) => repositories.extend(found),
            Err(e) => log::warn!("Skipping GitHub installation {}: {e}", installation.id),
        }
    }
    Ok(HttpResponse::Ok().json(repositories))
}

async fn require_project(
    pool: &DbPool,
    actor: &ApiActor,
    project_id: i32,
    action: Action,
) -> AppResult<()> {
    access::require(pool, actor.is_admin(), actor.user_id(), project_id, action).await?;
    crate::services::ProjectService::get_by_id(pool, project_id).await?;
    Ok(())
}

#[cfg_attr(feature = "openapi", utoipa::path(
    get,
    path = "/api/projects/{project_id}/github",
    tag = "GitHub",
    params(
        ("project_id" = i32, Path, description = "Project ID"),
    ),
    responses(
        (status = 200, description = "The project's repository, if any", body = Option<crate::models::github::ProjectRepository>),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
        (status = 404, description = "Not found", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// GET /api/projects/{project_id}/github
pub async fn get_project_repository(
    pool: web::Data<DbPool>,
    path: web::Path<i32>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    let project_id = path.into_inner();
    require_project(pool.get_ref(), &actor, project_id, Action::ViewProject).await?;
    Ok(HttpResponse::Ok()
        .json(GitHubService::project_repository(pool.get_ref(), project_id).await?))
}

#[cfg_attr(feature = "openapi", utoipa::path(
    put,
    path = "/api/projects/{project_id}/github",
    tag = "GitHub",
    params(
        ("project_id" = i32, Path, description = "Project ID"),
    ),
    request_body = UpdateProjectRepository,
    responses(
        (status = 200, description = "Repository saved", body = crate::models::github::ProjectRepository),
        (status = 400, description = "Invalid request", body = crate::error::ErrorResponse),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
        (status = 404, description = "Not found", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// PUT /api/projects/{project_id}/github
pub async fn put_project_repository(
    pool: web::Data<DbPool>,
    path: web::Path<i32>,
    body: web::Json<UpdateProjectRepository>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    let project_id = path.into_inner();
    require_project(pool.get_ref(), &actor, project_id, Action::UpdateProject).await?;
    // The name goes into a GitHub API path; anything but `owner/repo` would
    // point the installation token at another endpoint.
    let valid = |part: &str| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    match body.repo_full_name.split_once('/') {
        Some((owner, name)) if valid(owner) && valid(name) => {}
        _ => return Err(AppError::Validation("Invalid repository name".into())),
    }
    let app = GitHubService::require_app(pool.get_ref()).await?;
    // Asking GitHub proves the installation reaches the repository.
    let repo = GitHubClient::new(&app)
        .repository(body.installation_id, &body.repo_full_name)
        .await?;
    GitHubService::save_project_repository(
        pool.get_ref(),
        project_id,
        body.installation_id,
        &repo.full_name,
        &repo.default_branch,
        body.code_mappings.as_deref().unwrap_or_default(),
    )
    .await?;
    Ok(HttpResponse::Ok()
        .json(GitHubService::project_repository(pool.get_ref(), project_id).await?))
}

#[cfg_attr(feature = "openapi", utoipa::path(
    delete,
    path = "/api/projects/{project_id}/github",
    tag = "GitHub",
    params(
        ("project_id" = i32, Path, description = "Project ID"),
    ),
    responses(
        (status = 204, description = "Repository removed"),
        (status = 401, description = "Unauthorized", body = crate::error::ErrorResponse),
        (status = 403, description = "Forbidden", body = crate::error::ErrorResponse),
        (status = 404, description = "Not found", body = crate::error::ErrorResponse),
    ),
    security(("bearer_auth" = [])),
))]
/// DELETE /api/projects/{project_id}/github
pub async fn delete_project_repository(
    pool: web::Data<DbPool>,
    path: web::Path<i32>,
    actor: ApiActor,
) -> AppResult<HttpResponse> {
    let project_id = path.into_inner();
    require_project(pool.get_ref(), &actor, project_id, Action::UpdateProject).await?;
    GitHubService::delete_project_repository(pool.get_ref(), project_id).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[cfg_attr(feature = "openapi", utoipa::path(
    post,
    path = "/api/github/webhook",
    tag = "GitHub",
    request_body(content = Object, content_type = "application/json", description = "GitHub event payload, signed in X-Hub-Signature-256"),
    responses(
        (status = 204, description = "Event processed"),
        (status = 400, description = "Invalid request", body = crate::error::ErrorResponse),
        (status = 401, description = "Invalid signature", body = crate::error::ErrorResponse),
        (status = 404, description = "No GitHub App connected", body = crate::error::ErrorResponse),
    ),
    security(()),
))]
/// POST /api/github/webhook: public, and trusted only through the signature
/// GitHub computes with the app's webhook secret.
pub async fn webhook(
    pool: web::Data<DbPool>,
    req: HttpRequest,
    body: web::Bytes,
) -> AppResult<HttpResponse> {
    let app = GitHubService::require_app(pool.get_ref()).await?;
    let header = |name: &str| {
        req.headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    };
    if !crate::services::github::verify_signature(
        &app.webhook_secret,
        &body,
        &header("X-Hub-Signature-256"),
    ) {
        return Err(AppError::Unauthorized("Invalid webhook signature".into()));
    }
    let payload: Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::Validation(format!("Invalid webhook payload: {e}")))?;
    crate::services::github::webhook::handle(
        pool.get_ref(),
        &app,
        &header("X-GitHub-Event"),
        &payload,
    )
    .await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/github")
            .route("", web::get().to(status))
            .route("", web::delete().to(disconnect))
            .route("/manifest", web::post().to(manifest))
            .route("/callback", web::get().to(callback))
            .route("/installed", web::get().to(installed))
            .route("/repositories", web::get().to(repositories))
            .service(
                // GitHub sends up to 25 MB; `installation` events list every
                // repository and outgrow actix's 256 KiB default.
                web::resource("/webhook")
                    .app_data(web::PayloadConfig::new(25 * 1024 * 1024))
                    .route(web::post().to(webhook)),
            ),
    )
    .service(
        web::scope("/api/projects/{project_id}/github")
            .route("", web::get().to(get_project_repository))
            .route("", web::put().to(put_project_repository))
            .route("", web::delete().to(delete_project_repository)),
    );
}
