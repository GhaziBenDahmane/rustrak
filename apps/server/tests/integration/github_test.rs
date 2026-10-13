//! The GitHub integration over HTTP, against a fake GitHub API that runs on
//! loopback inside the test and records every call Rustrak makes to it.

use crate::common::TestDb;
use actix_session::{storage::CookieSessionStore, SessionMiddleware};
use actix_web::cookie::Key;
use actix_web::{test, web, App, HttpRequest, HttpResponse, HttpServer};
use chrono::Utc;
use rustrak::config::{Config, DashboardConfig, DatabaseConfig, RateLimitConfig};
use rustrak::models::github::{CodeMapping, GitHubApp};
use rustrak::models::CreateProject;
use rustrak::routes;
use rustrak::services::github::GitHubService;
use rustrak::services::{AuthTokenService, ProjectService};
use serde_json::{json, Value};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const KEY: &str = include_str!("../fixtures/github_app_test_key.txt");

// =============================================================================
// A fake GitHub
// =============================================================================

#[derive(Clone, Debug)]
struct Call {
    method: String,
    path: String,
    body: Value,
}

struct FakeGitHub {
    url: String,
    calls: Arc<Mutex<Vec<Call>>>,
}

impl FakeGitHub {
    async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let calls = Arc::new(Mutex::new(Vec::new()));
        let data = web::Data::from(calls.clone());
        let server = HttpServer::new(move || {
            App::new()
                .app_data(data.clone())
                .default_service(web::to(answer))
        })
        .workers(1)
        .listen(listener)
        .unwrap()
        .run();
        actix_web::rt::spawn(server);
        FakeGitHub { url, calls }
    }

    fn calls(&self) -> Vec<Call> {
        self.calls.lock().unwrap().clone()
    }

    /// Waits for a call Rustrak makes in the background.
    async fn wait_for(&self, method: &str, path: &str) -> Call {
        for _ in 0..50 {
            if let Some(call) = self
                .calls()
                .into_iter()
                .find(|c| c.method == method && c.path == path)
            {
                return call;
            }
            actix_web::rt::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("GitHub never received {method} {path}: {:?}", self.calls());
    }
}

async fn answer(
    req: HttpRequest,
    body: web::Bytes,
    calls: web::Data<Mutex<Vec<Call>>>,
) -> HttpResponse {
    let method = req.method().to_string();
    let path = req.path().to_string();
    let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    calls.lock().unwrap().push(Call {
        method: method.clone(),
        path: path.clone(),
        body: body.clone(),
    });
    let repo = json!({
        "full_name": "acme/web", "default_branch": "trunk", "private": true,
        "html_url": "https://github.com/acme/web",
    });
    match (method.as_str(), path.as_str()) {
        ("POST", "/app-manifests/abc/conversions") => HttpResponse::Created().json(json!({
            "id": 7, "slug": "rustrak-test", "client_id": "Iv1.x", "client_secret": "cs",
            "webhook_secret": "whs", "pem": KEY, "html_url": "https://github.com/apps/rustrak-test",
            "owner": { "login": "acme" },
        })),
        // An installation removed on GitHub whose `deleted` webhook never came.
        ("POST", "/app/installations/13/access_tokens") => {
            HttpResponse::NotFound().json(json!({ "message": "Not Found" }))
        }
        ("POST", p) if p.ends_with("/access_tokens") => HttpResponse::Created().json(json!({
            "token": "ghs_test", "expires_at": (Utc::now() + chrono::Duration::hours(1)).to_rfc3339(),
        })),
        ("GET", "/app/installations/99") => HttpResponse::Ok().json(json!({
            "account": { "login": "acme", "type": "Organization" },
        })),
        ("GET", "/installation/repositories") => {
            HttpResponse::Ok().json(json!({ "repositories": [repo] }))
        }
        ("GET", "/repos/acme/web") => HttpResponse::Ok().json(repo),
        ("POST", "/repos/acme/web/issues") => HttpResponse::Created().json(json!({
            "number": 7, "title": body["title"], "state": "open",
            "html_url": "https://github.com/acme/web/issues/7",
        })),
        ("GET", "/repos/acme/web/issues/12") => HttpResponse::Ok().json(json!({
            "number": 12, "title": "Login is broken", "state": "open",
            "html_url": "https://github.com/acme/web/issues/12",
        })),
        ("GET", "/repos/acme/web/contents/.github/CODEOWNERS") => {
            HttpResponse::Ok().body("* @acme/all\n/src/api/ @acme/backend\n")
        }
        ("PATCH", _) | ("POST", _) => HttpResponse::Ok().json(json!({})),
        _ => HttpResponse::NotFound().json(json!({ "message": "Not Found" })),
    }
}

// =============================================================================
// Rustrak under test
// =============================================================================

fn test_config() -> Config {
    Config {
        host: "127.0.0.1".to_string(),
        port: 0,
        database: DatabaseConfig {
            url: "sqlite::memory:".to_string(),
            max_connections: 5,
            min_connections: 1,
            acquire_timeout: Duration::from_secs(5),
            idle_timeout: Duration::from_secs(60),
            max_lifetime: Duration::from_secs(300),
        },
        rate_limit: RateLimitConfig {
            max_events_per_minute: 1000,
            max_events_per_hour: 10000,
            max_events_per_project_per_minute: 500,
            max_events_per_project_per_hour: 5000,
        },
        security: rustrak::config::SecurityConfig {
            ssl_proxy: false,
            session_secret_key: None,
        },
        ingest_dir: None,
        public_url: Some("https://rustrak.example.com".to_string()),
        sourcemap_storage_path: "/tmp/test_sourcemaps".to_string(),
        sourcemap_cache_bytes: 64 * 1024 * 1024,
        max_chunk_size_bytes: 10 * 1024 * 1024,
        session_flush_interval_secs: 30,
        session_cardinality_cap: 10_000,
        dashboard: DashboardConfig {
            dir: "./static".to_string(),
            enabled: true,
            url: None,
        },
        telemetry: rustrak::config::TelemetryConfig {
            enabled: false,
            do_not_track: false,
        },
    }
}

macro_rules! app {
    ($db:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($db.pool.clone()))
                .app_data(web::Data::new(test_config()))
                .wrap(
                    SessionMiddleware::builder(CookieSessionStore::default(), Key::generate())
                        .cookie_secure(false)
                        .build(),
                )
                .configure(routes::github::configure)
                .configure(routes::issues::configure),
        )
        .await
    };
}

async fn token(db: &TestDb) -> String {
    AuthTokenService::create(
        &db.pool,
        rustrak::models::CreateAuthToken { description: None },
    )
    .await
    .unwrap()
    .token
}

fn bearer(token: &str) -> (&'static str, String) {
    ("Authorization", format!("Bearer {token}"))
}

async fn project(db: &TestDb) -> rustrak::models::Project {
    ProjectService::create(
        &db.pool,
        CreateProject {
            name: "Web".to_string(),
            slug: Some("web".to_string()),
            platform: None,
        },
    )
    .await
    .unwrap()
}

/// The app, installation 99 on `acme`, and the project pointed at acme/web.
async fn connect(db: &TestDb, github: &FakeGitHub, project_id: i32) {
    GitHubService::save_app(
        &db.pool,
        &GitHubApp {
            app_id: 7,
            slug: "rustrak-test".into(),
            client_id: "Iv1.x".into(),
            client_secret: "cs".into(),
            webhook_secret: "whs".into(),
            private_key: KEY.into(),
            html_url: "https://github.com/apps/rustrak-test".into(),
            owner_login: "acme".into(),
            web_url: "https://github.com".into(),
            api_url: github.url.clone(),
            last_webhook_at: None,
            created_at: Utc::now(),
        },
    )
    .await
    .unwrap();
    GitHubService::upsert_installation(&db.pool, 99, "acme", "Organization")
        .await
        .unwrap();
    GitHubService::save_project_repository(
        &db.pool,
        project_id,
        99,
        "acme/web",
        "trunk",
        &[CodeMapping {
            stack_root: "/app/".into(),
            source_root: "".into(),
        }],
    )
    .await
    .unwrap();
}

// =============================================================================
// Connecting the app
// =============================================================================

#[actix_web::test]
async fn status_reports_no_app_until_one_is_connected() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let app = app!(db);

    let req = test::TestRequest::get()
        .uri("/api/github")
        .insert_header(bearer(&token))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(body["app"], Value::Null);
    assert_eq!(
        body["webhook_url"],
        "https://rustrak.example.com/api/github/webhook"
    );

    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let req = test::TestRequest::get()
        .uri("/api/github")
        .insert_header(bearer(&token))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(body["app"]["slug"], "rustrak-test");
    assert_eq!(
        body["app"]["install_url"],
        "https://github.com/apps/rustrak-test/installations/new"
    );
    assert_eq!(body["installations"][0]["account_login"], "acme");
}

#[actix_web::test]
async fn manifest_flow_creates_the_app() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let app = app!(db);

    let req = test::TestRequest::post()
        .uri("/api/github/manifest")
        .insert_header(bearer(&token))
        .set_json(json!({ "organization": "acme" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let cookie = resp.response().cookies().next().unwrap().into_owned();
    let body: Value = test::read_body_json(resp).await;
    let action = body["action_url"].as_str().unwrap();
    assert!(action.starts_with("https://github.com/organizations/acme/settings/apps/new?state="));
    let state = action.split("state=").nth(1).unwrap();
    let manifest: Value = serde_json::from_str(body["manifest"].as_str().unwrap()).unwrap();
    assert_eq!(
        manifest["hook_attributes"]["url"],
        "https://rustrak.example.com/api/github/webhook"
    );
    assert_eq!(
        manifest["redirect_url"],
        "https://rustrak.example.com/api/github/callback"
    );

    // A callback whose state is not the one handed out is refused.
    let req = test::TestRequest::get()
        .uri("/api/github/callback?code=abc&state=forged")
        .insert_header(bearer(&token))
        .cookie(cookie.clone())
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);

    // The real one trades the code for the app's credentials, at the API
    // `GITHUB_API_URL` names (api.github.com when unset).
    std::env::set_var("GITHUB_API_URL", &github.url);
    let req = test::TestRequest::get()
        .uri(&format!("/api/github/callback?code=abc&state={state}"))
        .insert_header(bearer(&token))
        .cookie(cookie)
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 302);
    assert_eq!(
        resp.headers().get("Location").unwrap(),
        "/settings/integrations?github=connected"
    );
    let stored = GitHubService::app(&db.pool).await.unwrap().unwrap();
    assert_eq!(stored.app_id, 7);
    assert_eq!(stored.webhook_secret, "whs");
}

#[actix_web::test]
async fn manifest_sends_the_browser_to_the_dashboard_host() {
    let db = TestDb::new().await;
    let token = token(&db).await;
    let base = test_config();
    let config = rustrak::config::Config {
        dashboard: DashboardConfig {
            url: Some("https://errors.example.com".to_string()),
            ..base.dashboard.clone()
        },
        ..base
    };
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(db.pool.clone()))
            .app_data(web::Data::new(config))
            .wrap(
                SessionMiddleware::builder(CookieSessionStore::default(), Key::generate())
                    .cookie_secure(false)
                    .build(),
            )
            .configure(routes::github::configure),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/github/manifest")
        .insert_header(bearer(&token))
        .set_json(json!({}))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    let manifest: Value = serde_json::from_str(body["manifest"].as_str().unwrap()).unwrap();
    // The session cookie lives on the dashboard's host, so GitHub must send
    // the browser back there; only the webhook goes to PUBLIC_URL.
    assert_eq!(
        manifest["redirect_url"],
        "https://errors.example.com/api/github/callback"
    );
    assert_eq!(
        manifest["setup_url"],
        "https://errors.example.com/api/github/installed"
    );
    assert_eq!(
        manifest["hook_attributes"]["url"],
        "https://rustrak.example.com/api/github/webhook"
    );
}

#[actix_web::test]
async fn installing_the_app_records_the_installation() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let app = app!(db);

    let req = test::TestRequest::get()
        .uri("/api/github/installed?installation_id=99&setup_action=install")
        .insert_header(bearer(&token))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 302);
    let installations = GitHubService::installations(&db.pool).await.unwrap();
    assert_eq!(installations[0].account_type, "Organization");
}

#[actix_web::test]
async fn disconnecting_forgets_the_app_and_project_repositories() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let app = app!(db);

    let req = test::TestRequest::delete()
        .uri("/api/github")
        .insert_header(bearer(&token))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);
    assert!(GitHubService::app(&db.pool).await.unwrap().is_none());
    assert!(GitHubService::project_repository(&db.pool, project.id)
        .await
        .unwrap()
        .is_none());
}

// =============================================================================
// A project's repository
// =============================================================================

#[actix_web::test]
async fn repositories_lists_what_the_installations_reach() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let app = app!(db);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/github/repositories?project_id={}",
            project.id
        ))
        .insert_header(bearer(&token))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(body[0]["full_name"], "acme/web");
    assert_eq!(body[0]["installation_id"], 99);
}

#[actix_web::test]
async fn repositories_skip_an_installation_github_no_longer_has() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    GitHubService::upsert_installation(&db.pool, 13, "gone", "User")
        .await
        .unwrap();
    let app = app!(db);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/github/repositories?project_id={}",
            project.id
        ))
        .insert_header(bearer(&token))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: Value = test::read_body_json(resp).await;
    assert_eq!(body[0]["full_name"], "acme/web");
}

#[actix_web::test]
async fn project_repository_refuses_a_name_that_is_not_owner_slash_repo() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let app = app!(db);

    for name in [
        "../user",
        "acme/web/issues",
        "acme/..",
        "acme/web?x=1",
        "acme",
    ] {
        let req = test::TestRequest::put()
            .uri(&format!("/api/projects/{}/github", project.id))
            .insert_header(bearer(&token))
            .set_json(json!({ "installation_id": 99, "repo_full_name": name }))
            .to_request();
        assert_eq!(test::call_service(&app, req).await.status(), 400, "{name}");
    }
    assert!(!github.calls().iter().any(|c| c.method == "GET"));
}

#[actix_web::test]
async fn project_repository_round_trip() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let token = token(&db).await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    GitHubService::delete_project_repository(&db.pool, project.id)
        .await
        .unwrap();
    let app = app!(db);
    let uri = format!("/api/projects/{}/github", project.id);

    let req = test::TestRequest::get()
        .uri(&uri)
        .insert_header(bearer(&token))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(body, Value::Null);

    let req = test::TestRequest::put()
        .uri(&uri)
        .insert_header(bearer(&token))
        .set_json(json!({
            "installation_id": 99,
            "repo_full_name": "acme/web",
            "code_mappings": [{ "stack_root": "/app/", "source_root": "src/" }],
        }))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, req).await;
    // The default branch comes from GitHub, not from the request: saving asks
    // GitHub, which is also what proves the installation reaches the repo.
    let asked = github.wait_for("GET", "/repos/acme/web").await;
    assert!(asked.body.is_null());
    assert_eq!(body["default_branch"], "trunk");
    assert_eq!(body["html_url"], "https://github.com/acme/web");
    assert_eq!(body["code_mappings"][0]["source_root"], "src/");

    let req = test::TestRequest::delete()
        .uri(&uri)
        .insert_header(bearer(&token))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);
}

// =============================================================================
// Webhooks
// =============================================================================

fn webhook(event: &str, payload: &Value, secret: &str) -> test::TestRequest {
    use hmac::{Hmac, KeyInit, Mac};
    let body = payload.to_string();
    let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body.as_bytes());
    let signature = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));
    test::TestRequest::post()
        .uri("/api/github/webhook")
        .insert_header(("X-GitHub-Event", event))
        .insert_header(("X-Hub-Signature-256", signature))
        .insert_header(("Content-Type", "application/json"))
        .set_payload(body)
}

#[actix_web::test]
async fn webhooks_with_a_wrong_signature_are_refused() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let app = app!(db);

    let payload = json!({ "action": "created", "installation": { "id": 7 } });
    let req = webhook("installation", &payload, "wrong").to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 401);
}

#[actix_web::test]
async fn webhooks_larger_than_the_default_body_limit_are_read() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let app = app!(db);

    // `installation.created` carries every repository; a large account
    // passes actix's 256 KiB default.
    let repositories: Vec<Value> = (0..10_000)
        .map(|i| json!({ "id": i, "full_name": format!("big/repository-{i}") }))
        .collect();
    let payload = json!({
        "action": "created",
        "installation": { "id": 42, "account": { "login": "big", "type": "Organization" } },
        "repositories": repositories,
    });
    assert!(payload.to_string().len() > 256 * 1024);
    let req = webhook("installation", &payload, "whs").to_request();
    assert_eq!(test::call_service(&app, req).await.status(), 204);
}

#[actix_web::test]
async fn uninstalling_the_app_on_github_removes_the_installation() {
    let db = TestDb::new().await;
    let github = FakeGitHub::start().await;
    let project = project(&db).await;
    connect(&db, &github, project.id).await;
    let app = app!(db);

    let payload = json!({ "action": "deleted", "installation": { "id": 99, "account": { "login": "acme" } } });
    test::call_service(&app, webhook("installation", &payload, "whs").to_request()).await;
    assert!(GitHubService::installations(&db.pool)
        .await
        .unwrap()
        .is_empty());
}
