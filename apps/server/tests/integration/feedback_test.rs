//! User Feedback: the `feedback` envelope item (an event carrying
//! `contexts.feedback`) and the legacy `user_report` item, through to the
//! feedback issue, the link to the error it was about, and its alert.
//!
//! Mirrors Sentry: every feedback is its own issue (`FeedbackGroup`, category
//! `feedback`), kept out of the default issue list, and a legacy user report
//! is shimmed into one (`shim_to_feedback.py`).

use crate::common::{process_error_event, TestDb};
use actix_web::dev::{Service, ServiceResponse};
use actix_web::{test, web, App};
use chrono::Utc;
use rustrak::config::{Config, DashboardConfig, DatabaseConfig, RateLimitConfig};
use rustrak::db::DbPool;
use rustrak::digest::processors::Processors;
use rustrak::ingest::{store_event, EventMetadata};
use rustrak::models::{
    AlertRuleChannelInput, AlertType, ChannelType, CreateAlertRule, CreateNotificationChannel,
    CreateProject,
};
use rustrak::pagination::{IssueCategory, IssueFilter, IssueSort, SortOrder};
use rustrak::routes;
use rustrak::services::{AlertService, IssueService, IssueSocialService, ProjectService};
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use uuid::Uuid;

fn rate_limit() -> RateLimitConfig {
    RateLimitConfig {
        max_events_per_minute: 1000,
        max_events_per_hour: 10000,
        max_events_per_project_per_minute: 500,
        max_events_per_project_per_hour: 5000,
    }
}

fn config(ingest_dir: &Path) -> Config {
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
        rate_limit: rate_limit(),
        security: rustrak::config::SecurityConfig {
            ssl_proxy: false,
            session_secret_key: None,
        },
        ingest_dir: Some(ingest_dir.to_string_lossy().to_string()),
        public_url: None,
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

struct Setup {
    db: TestDb,
    project: rustrak::models::Project,
    ingest: tempfile::TempDir,
}

async fn setup() -> Setup {
    let db = TestDb::new().await;
    let project = ProjectService::create(
        &db.pool,
        CreateProject {
            name: format!("Feedback {}", Uuid::new_v4()),
            slug: None,
            platform: None,
        },
    )
    .await
    .unwrap();
    Setup {
        db,
        project,
        ingest: tempfile::tempdir().unwrap(),
    }
}

async fn app(
    s: &Setup,
) -> impl Service<actix_http::Request, Response = ServiceResponse, Error = actix_web::Error> {
    let config = config(s.ingest.path());
    test::init_service(
        App::new()
            .app_data(web::Data::new(s.db.pool.clone()))
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(Processors::new(
                s.ingest.path().to_path_buf(),
                config.rate_limit.clone(),
                crate::common::null_sourcemap_provider(),
                None,
            )))
            // Before ingest, as in `main.rs`: its `/api/{project_id}` scope
            // would otherwise claim `/api/0/...`.
            .configure(routes::sentry_api::configure)
            // Events before issues, as in `main.rs`: the issues scope would
            // claim `/issues/{id}/events/...`.
            .configure(routes::events::configure)
            .configure(routes::issues::configure)
            .configure(routes::ingest::configure),
    )
    .await
}

fn post_envelope(s: &Setup, body: Vec<u8>) -> actix_http::Request {
    test::TestRequest::post()
        .uri(&format!("/api/{}/envelope/", s.project.id))
        .insert_header((
            "X-Sentry-Auth",
            format!(
                "Sentry sentry_key={}, sentry_version=7",
                s.project.sentry_key.simple()
            ),
        ))
        .set_payload(body)
        .to_request()
}

/// An envelope of one item of `item_type`.
fn envelope(event_id: &str, item_type: &str, payload: &Value) -> Vec<u8> {
    let body = payload.to_string();
    format!(
        "{{\"event_id\":\"{event_id}\"}}\n{{\"type\":\"{item_type}\",\"length\":{}}}\n{body}",
        body.len()
    )
    .into_bytes()
}

fn new_id() -> String {
    Uuid::new_v4().simple().to_string()
}

/// A feedback event as the SDKs send it (develop.sentry.dev/sdk/telemetry/feedbacks/).
fn feedback_event(event_id: &str, feedback: Value) -> Value {
    json!({
        "type": "feedback",
        "event_id": event_id,
        "timestamp": Utc::now().timestamp() as f64,
        "platform": "javascript",
        "environment": "production",
        "contexts": { "feedback": feedback },
    })
}

fn error_event(event_id: &str) -> Value {
    json!({
        "event_id": event_id,
        "timestamp": Utc::now().timestamp() as f64,
        "platform": "javascript",
        "level": "error",
        "exception": { "values": [{ "type": "TypeError", "value": "x is undefined" }] },
    })
}

/// Digests `event` the way the ingest path does, synchronously.
async fn digest(s: &Setup, event: &Value) -> rustrak::error::AppResult<()> {
    let event_id = event["event_id"].as_str().unwrap();
    store_event(s.ingest.path(), event_id, event.to_string().as_bytes())
        .await
        .unwrap();
    let metadata = EventMetadata {
        event_id: event_id.to_string(),
        project_id: s.project.id,
        ingested_at: Utc::now(),
        remote_addr: None,
    };
    process_error_event(
        &s.db.pool,
        &metadata,
        s.ingest.path(),
        &rate_limit(),
        crate::common::null_sourcemap_provider(),
    )
    .await
}

#[derive(sqlx::FromRow, Debug)]
struct IssueRow {
    id: Uuid,
    issue_type: String,
    issue_category: String,
    calculated_type: String,
    calculated_value: String,
    level: Option<String>,
}

async fn issues(pool: &DbPool, project_id: i32) -> Vec<IssueRow> {
    sqlx::query_as(
        "SELECT id, issue_type, issue_category, calculated_type, calculated_value, level \
         FROM issues WHERE project_id = $1 ORDER BY digest_order",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

/// The digest runs in a spawned task; poll (bounded) for `count` issues.
async fn wait_for_issues(pool: &DbPool, project_id: i32, count: usize) -> Vec<IssueRow> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        let rows = issues(pool, project_id).await;
        if rows.len() >= count || tokio::time::Instant::now() >= deadline {
            return rows;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[actix_web::test]
async fn feedback_envelope_creates_a_feedback_issue() {
    let s = setup().await;
    let app = app(&s).await;
    let id = new_id();
    let event = feedback_event(
        &id,
        json!({ "message": "The checkout button does nothing", "contact_email": "jane@example.com" }),
    );

    let resp = test::call_service(&app, post_envelope(&s, envelope(&id, "feedback", &event))).await;
    assert_eq!(resp.status(), 200);

    let rows = wait_for_issues(&s.db.pool, s.project.id, 1).await;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].issue_type, "feedback");
    assert_eq!(rows[0].issue_category, "feedback");
    assert_eq!(rows[0].calculated_type, "User Feedback");
    assert_eq!(rows[0].calculated_value, "The checkout button does nothing");
    // Sentry's feedback occurrence defaults to `info`.
    assert_eq!(rows[0].level.as_deref(), Some("info"));
}

#[actix_web::test]
async fn every_feedback_is_its_own_issue() {
    let s = setup().await;
    for _ in 0..2 {
        digest(
            &s,
            &feedback_event(&new_id(), json!({ "message": "Same words" })),
        )
        .await
        .unwrap();
    }
    assert_eq!(issues(&s.db.pool, s.project.id).await.len(), 2);
}

#[actix_web::test]
async fn invalid_feedback_is_dropped() {
    let s = setup().await;
    let too_long = "x".repeat(4097);
    for feedback in [
        json!({}),
        json!({ "message": "   " }),
        json!({ "message": too_long }),
        json!({ "message": "ok", "associated_event_id": "not-a-uuid" }),
    ] {
        assert!(digest(&s, &feedback_event(&new_id(), feedback))
            .await
            .is_err());
    }
    assert!(issues(&s.db.pool, s.project.id).await.is_empty());
}

#[actix_web::test]
async fn a_message_of_exactly_the_limit_is_kept() {
    let s = setup().await;
    // The limit counts characters, not bytes.
    let message = "é".repeat(4096);
    digest(
        &s,
        &feedback_event(&new_id(), json!({ "message": message })),
    )
    .await
    .unwrap();
    assert_eq!(issues(&s.db.pool, s.project.id).await.len(), 1);
}

#[actix_web::test]
async fn feedback_is_linked_to_the_issue_of_its_event() {
    let s = setup().await;
    let error_id = new_id();
    digest(&s, &error_event(&error_id)).await.unwrap();
    let error_issue = issues(&s.db.pool, s.project.id).await.remove(0);

    digest(
        &s,
        &feedback_event(
            &new_id(),
            json!({
                "message": "It crashed when I paid",
                "contact_email": "jane@example.com",
                "name": "Jane",
                "associated_event_id": error_id,
            }),
        ),
    )
    .await
    .unwrap();

    let reports = IssueSocialService::list_user_reports(&s.db.pool, error_issue.id)
        .await
        .unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0].comments, "It crashed when I paid");
    assert_eq!(reports[0].email, "jane@example.com");
    assert_eq!(reports[0].name, "Jane");
}

#[actix_web::test]
async fn feedback_before_its_event_is_linked_when_the_event_arrives() {
    let s = setup().await;
    let error_id = new_id();
    digest(
        &s,
        &feedback_event(
            &new_id(),
            json!({ "message": "Broken", "associated_event_id": error_id }),
        ),
    )
    .await
    .unwrap();
    digest(&s, &error_event(&error_id)).await.unwrap();

    let error_issue = issues(&s.db.pool, s.project.id)
        .await
        .into_iter()
        .find(|i| i.issue_category == "error")
        .unwrap();
    let reports = IssueSocialService::list_user_reports(&s.db.pool, error_issue.id)
        .await
        .unwrap();
    assert_eq!(reports.len(), 1);
}

#[actix_web::test]
async fn legacy_user_report_becomes_a_feedback_issue() {
    let s = setup().await;
    let app = app(&s).await;
    let error_id = new_id();
    digest(&s, &error_event(&error_id)).await.unwrap();

    let report = json!({
        "event_id": error_id,
        "name": "Josh",
        "email": "josh@example.com",
        "comments": "I'm having fun",
    });
    let resp = test::call_service(
        &app,
        post_envelope(&s, envelope(&error_id, "user_report", &report)),
    )
    .await;
    assert_eq!(resp.status(), 200);

    let rows = wait_for_issues(&s.db.pool, s.project.id, 2).await;
    let feedback: Vec<_> = rows
        .iter()
        .filter(|i| i.issue_category == "feedback")
        .collect();
    assert_eq!(feedback.len(), 1);
    assert_eq!(feedback[0].calculated_value, "I'm having fun");

    let error_issue = rows.iter().find(|i| i.issue_category == "error").unwrap();
    let reports = IssueSocialService::list_user_reports(&s.db.pool, error_issue.id)
        .await
        .unwrap();
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0].name, "Josh");
    assert_eq!(reports[0].email, "josh@example.com");
}

#[actix_web::test]
async fn a_retried_user_report_is_one_feedback() {
    let s = setup().await;
    let app = app(&s).await;
    let error_id = new_id();
    let report = json!({ "event_id": error_id, "comments": "Twice" });
    for _ in 0..2 {
        let resp = test::call_service(
            &app,
            post_envelope(&s, envelope(&error_id, "user_report", &report)),
        )
        .await;
        assert_eq!(resp.status(), 200);
    }
    wait_for_issues(&s.db.pool, s.project.id, 2).await;
    assert_eq!(issues(&s.db.pool, s.project.id).await.len(), 1);
}

#[actix_web::test]
async fn the_issue_list_shows_one_category_at_a_time() {
    let s = setup().await;
    digest(&s, &error_event(&new_id())).await.unwrap();
    digest(&s, &feedback_event(&new_id(), json!({ "message": "Hi" })))
        .await
        .unwrap();

    let list = |category| {
        IssueService::list_offset(
            &s.db.pool,
            s.project.id,
            IssueSort::LastSeen,
            SortOrder::Desc,
            IssueFilter::All,
            category,
            1,
            50,
            None,
        )
    };
    let (errors, total) = list(IssueCategory::Error).await.unwrap();
    assert_eq!((errors.len(), total), (1, 1));
    assert_eq!(errors[0].issue_category, "error");

    let (feedback, total) = list(IssueCategory::Feedback).await.unwrap();
    assert_eq!((feedback.len(), total), (1, 1));
    assert_eq!(feedback[0].issue_category, "feedback");
}

async fn rule(s: &Setup, alert_type: AlertType) {
    let channel = AlertService::create_channel(
        &s.db.pool,
        CreateNotificationChannel {
            name: format!("sink {alert_type}"),
            provider_type: ChannelType::Webhook,
            credentials: json!({ "url": "http://127.0.0.1:9/unused" }),
            is_enabled: true,
        },
    )
    .await
    .unwrap();
    AlertService::create_rule(
        &s.db.pool,
        s.project.id,
        CreateAlertRule {
            name: alert_type.to_string(),
            alert_type,
            conditions: json!({}),
            cooldown_minutes: 0,
            channels: vec![AlertRuleChannelInput {
                integration_id: channel.id,
                routing_override: json!({}),
            }],
        },
    )
    .await
    .unwrap();
}

async fn fired(pool: &DbPool, project_id: i32) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT alert_type FROM alert_history WHERE project_id = $1 ORDER BY alert_type",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

#[actix_web::test]
async fn feedback_fires_new_feedback_rules_and_errors_fire_new_issue_rules() {
    let s = setup().await;
    rule(&s, AlertType::NewIssue).await;
    rule(&s, AlertType::NewFeedback).await;

    digest(&s, &feedback_event(&new_id(), json!({ "message": "Hi" })))
        .await
        .unwrap();
    assert_eq!(fired(&s.db.pool, s.project.id).await, ["new_feedback"]);

    digest(&s, &error_event(&new_id())).await.unwrap();
    assert_eq!(
        fired(&s.db.pool, s.project.id).await,
        ["new_feedback", "new_issue"]
    );
}

#[actix_web::test]
async fn feedback_is_not_counted_as_an_issue() {
    use rustrak::services::StatsService;
    let s = setup().await;
    digest(&s, &error_event(&new_id())).await.unwrap();
    digest(&s, &feedback_event(&new_id(), json!({ "message": "Hi" })))
        .await
        .unwrap();

    let summary = StatsService::project_summary(&s.db.pool, s.project.id, Some(24))
        .await
        .unwrap();
    assert_eq!(summary.open_issues, 1);
    assert_eq!(summary.new_issues.current, 1);
    let all_time = StatsService::project_summary(&s.db.pool, s.project.id, None)
        .await
        .unwrap();
    assert_eq!(all_time.new_issues.current, 1);

    let list = StatsService::list_stats(&s.db.pool, &[s.project.id], 24)
        .await
        .unwrap();
    assert_eq!(list[&s.project.id].open_issues, 1);
    assert_eq!(list[&s.project.id].new_issues.current, 1);
}

#[actix_web::test]
async fn feedback_is_not_counted_as_an_error_event() {
    use rustrak::services::StatsService;
    let s = setup().await;
    digest(&s, &error_event(&new_id())).await.unwrap();
    digest(&s, &feedback_event(&new_id(), json!({ "message": "Hi" })))
        .await
        .unwrap();

    let summary = StatsService::project_summary(&s.db.pool, s.project.id, Some(24))
        .await
        .unwrap();
    assert_eq!(summary.events.current, 1);
    let list = StatsService::list_stats(&s.db.pool, &[s.project.id], 24)
        .await
        .unwrap();
    assert_eq!(list[&s.project.id].events.current, 1);
    let chart = StatsService::event_timeseries(&s.db.pool, s.project.id, None, 1)
        .await
        .unwrap();
    assert_eq!(chart.iter().map(|p| p.total).sum::<i64>(), 1);
}

/// Sentry's `POST /api/0/projects/{org}/{project}/user-feedback/`
/// (`ProjectUserReportsEndpoint`), with DSN or token auth.
fn post_user_feedback(s: &Setup, auth: String, body: &Value) -> actix_http::Request {
    test::TestRequest::post()
        .uri(&format!(
            "/api/0/projects/rustrak/{}/user-feedback/",
            s.project.slug
        ))
        .insert_header(("Authorization", auth))
        .set_json(body)
        .to_request()
}

fn dsn(s: &Setup, key: &str) -> String {
    format!("DSN http://{key}@localhost:8080/{}", s.project.id)
}

#[actix_web::test]
async fn the_user_feedback_endpoint_takes_a_report_with_dsn_auth() {
    let s = setup().await;
    let app = app(&s).await;
    let error_id = new_id();
    digest(&s, &error_event(&error_id)).await.unwrap();

    let report = json!({ "event_id": error_id, "name": "Ana", "email": "ana@example.com", "comments": "Blank page" });
    let key = s.project.sentry_key.simple().to_string();
    let resp = test::call_service(&app, post_user_feedback(&s, dsn(&s, &key), &report)).await;
    assert_eq!(resp.status(), 200);

    let rows = wait_for_issues(&s.db.pool, s.project.id, 2).await;
    let error_issue = rows.iter().find(|i| i.issue_category == "error").unwrap();
    assert!(rows.iter().any(|i| i.calculated_value == "Blank page"));
    let reports = IssueSocialService::list_user_reports(&s.db.pool, error_issue.id)
        .await
        .unwrap();
    assert_eq!(reports[0].name, "Ana");
}

#[actix_web::test]
async fn the_user_feedback_endpoint_rejects_another_projects_dsn() {
    let s = setup().await;
    let app = app(&s).await;
    let report = json!({ "event_id": new_id(), "comments": "x" });
    let wrong = Uuid::new_v4().simple().to_string();
    let resp = test::call_service(&app, post_user_feedback(&s, dsn(&s, &wrong), &report)).await;
    assert_eq!(resp.status(), 401);
}

#[actix_web::test]
async fn the_user_feedback_endpoint_takes_a_token_and_returns_the_report() {
    let s = setup().await;
    let app = app(&s).await;
    let token = rustrak::services::AuthTokenService::create(
        &s.db.pool,
        rustrak::models::CreateAuthToken { description: None },
    )
    .await
    .unwrap()
    .token;
    let error_id = new_id();
    let report = json!({ "event_id": error_id, "name": "Ana", "email": "ana@example.com", "comments": "Blank page" });
    let resp = test::call_service(
        &app,
        post_user_feedback(&s, format!("Bearer {token}"), &report),
    )
    .await;
    assert_eq!(resp.status(), 200);
    let body: Value = test::read_body_json(resp).await;
    assert_eq!(body["eventID"], error_id);
    assert_eq!(body["name"], "Ana");
    assert_eq!(body["email"], "ana@example.com");
    assert_eq!(body["comments"], "Blank page");

    // An invalid report is a 400, not a silent drop: nothing else tells the caller.
    let bad = json!({ "comments": "no event" });
    let resp = test::call_service(
        &app,
        post_user_feedback(&s, format!("Bearer {token}"), &bad),
    )
    .await;
    assert_eq!(resp.status(), 400);
}

// --- Attachments (screenshots) ---------------------------------------------

/// A PNG signature, then bytes a JSON scrub or a text decode would mangle.
const SCREENSHOT: &[u8] = b"\x89PNG\r\n\x1a\n\x00\\u0000\n\xff\xfe binary";

/// An envelope of one item, plus an `attachment` item after it.
fn envelope_with_attachment(
    event_id: &str,
    item_type: &str,
    payload: &Value,
    filename: &str,
    content_type: &str,
    data: &[u8],
) -> Vec<u8> {
    let mut body = envelope(event_id, item_type, payload);
    body.extend_from_slice(
        format!(
            "\n{{\"type\":\"attachment\",\"length\":{},\"filename\":\"{filename}\",\"content_type\":\"{content_type}\"}}\n",
            data.len()
        )
        .as_bytes(),
    );
    body.extend_from_slice(data);
    body
}

async fn attachment_count(pool: &DbPool, project_id: i32) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM event_attachments WHERE project_id = $1")
        .bind(project_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Sends a feedback with one attachment and waits for its issue.
async fn feedback_with_attachment(
    s: &Setup,
    app: &impl Service<actix_http::Request, Response = ServiceResponse, Error = actix_web::Error>,
    filename: &str,
    content_type: &str,
    data: &[u8],
) {
    let id = new_id();
    let event = feedback_event(&id, json!({ "message": "See the screenshot" }));
    let resp = test::call_service(
        app,
        post_envelope(
            s,
            envelope_with_attachment(&id, "feedback", &event, filename, content_type, data),
        ),
    )
    .await;
    assert_eq!(resp.status(), 200);
    wait_for_issues(&s.db.pool, s.project.id, 1).await;
}

#[actix_web::test]
async fn attachments_of_an_error_event_are_not_kept() {
    let s = setup().await;
    let app = app(&s).await;
    let id = new_id();
    let resp = test::call_service(
        &app,
        post_envelope(
            &s,
            envelope_with_attachment(
                &id,
                "event",
                &error_event(&id),
                "log.txt",
                "text/plain",
                b"log",
            ),
        ),
    )
    .await;
    assert_eq!(resp.status(), 200);
    wait_for_issues(&s.db.pool, s.project.id, 1).await;
    assert_eq!(attachment_count(&s.db.pool, s.project.id).await, 0);
}

#[actix_web::test]
async fn deleting_a_feedback_deletes_its_screenshot() {
    let s = setup().await;
    let app = app(&s).await;
    feedback_with_attachment(&s, &app, "screenshot.png", "image/png", SCREENSHOT).await;
    assert_eq!(attachment_count(&s.db.pool, s.project.id).await, 1);

    let issue = issues(&s.db.pool, s.project.id).await.remove(0);
    IssueService::delete(&s.db.pool, issue.id).await.unwrap();
    assert_eq!(attachment_count(&s.db.pool, s.project.id).await, 0);
}

#[actix_web::test]
async fn an_oversized_attachment_is_dropped_and_the_feedback_kept() {
    let s = setup().await;
    let app = app(&s).await;
    let huge = vec![0u8; rustrak::ingest::MAX_ATTACHMENT_SIZE + 1];
    feedback_with_attachment(&s, &app, "huge.png", "image/png", &huge).await;
    assert_eq!(issues(&s.db.pool, s.project.id).await.len(), 1);
    assert_eq!(attachment_count(&s.db.pool, s.project.id).await, 0);
}

#[actix_web::test]
async fn the_storage_cleanup_removes_old_feedback_and_its_screenshot() {
    use rustrak::models::CleanupFilter;
    use rustrak::services::StorageService;
    let s = setup().await;
    let app = app(&s).await;
    feedback_with_attachment(&s, &app, "screenshot.png", "image/png", SCREENSHOT).await;
    sqlx::query("UPDATE events SET ingested_at = $1 WHERE project_id = $2")
        .bind(Utc::now() - chrono::Duration::days(40))
        .bind(s.project.id)
        .execute(&s.db.pool)
        .await
        .unwrap();

    StorageService::execute_cleanup(&s.db.pool, 30, None, CleanupFilter::all())
        .await
        .unwrap();
    assert!(issues(&s.db.pool, s.project.id).await.is_empty());
    assert_eq!(attachment_count(&s.db.pool, s.project.id).await, 0);
}

async fn user_report_count(pool: &DbPool, project_id: i32) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM user_reports WHERE project_id = $1")
        .bind(project_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

/// An error and a feedback about it; returns (error issue, feedback issue).
async fn error_with_feedback(s: &Setup) -> (Uuid, Uuid) {
    let error_id = new_id();
    digest(s, &error_event(&error_id)).await.unwrap();
    digest(
        s,
        &feedback_event(
            &new_id(),
            json!({ "message": "Broken", "associated_event_id": error_id }),
        ),
    )
    .await
    .unwrap();
    let rows = issues(&s.db.pool, s.project.id).await;
    let id = |category: &str| {
        rows.iter()
            .find(|i| i.issue_category == category)
            .unwrap()
            .id
    };
    (id("error"), id("feedback"))
}

#[actix_web::test]
async fn deleting_a_feedback_removes_it_from_its_error() {
    let s = setup().await;
    let (error_issue, feedback_issue) = error_with_feedback(&s).await;
    IssueService::delete(&s.db.pool, feedback_issue)
        .await
        .unwrap();

    let reports = IssueSocialService::list_user_reports(&s.db.pool, error_issue)
        .await
        .unwrap();
    assert!(reports.is_empty());
    assert_eq!(user_report_count(&s.db.pool, s.project.id).await, 0);
}

#[actix_web::test]
async fn deleting_an_error_deletes_the_reports_about_it() {
    let s = setup().await;
    let (error_issue, _) = error_with_feedback(&s).await;
    IssueService::delete(&s.db.pool, error_issue).await.unwrap();
    // Not left behind with no issue, where nothing would ever show or clean it.
    assert_eq!(user_report_count(&s.db.pool, s.project.id).await, 0);
}
