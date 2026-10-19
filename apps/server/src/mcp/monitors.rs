use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::schedules::ScheduleArg;
use super::{args, done, reply, ProjectArgs, RustrakMcp};
use crate::routes::monitors;

/// A monitor_config, the shape Sentry SDKs send to create a monitor.
#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ConfigArg {
    /// Required when creating a monitor
    #[serde(skip_serializing_if = "Option::is_none")]
    schedule: Option<ScheduleArg>,
    /// Minutes a check-in may be late before the run counts as missed
    #[serde(skip_serializing_if = "Option::is_none")]
    checkin_margin: Option<u64>,
    /// Minutes a run may stay in progress before it times out
    #[serde(skip_serializing_if = "Option::is_none")]
    max_runtime: Option<u64>,
    /// IANA zone the crontab is read in
    #[serde(skip_serializing_if = "Option::is_none")]
    timezone: Option<String>,
    /// Consecutive failures before an issue opens (1-720)
    #[serde(skip_serializing_if = "Option::is_none")]
    failure_issue_threshold: Option<u64>,
    /// Consecutive successes before the issue resolves (1-720)
    #[serde(skip_serializing_if = "Option::is_none")]
    recovery_threshold: Option<u64>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct MonitorArgs {
    /// Project ID
    project_id: i32,
    /// Monitor slug
    slug: String,
}

impl MonitorArgs {
    fn path(&self) -> web::Path<(i32, String)> {
        web::Path::from((self.project_id, self.slug.clone()))
    }
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct CheckinsArgs {
    #[serde(flatten)]
    monitor: MonitorArgs,
    /// Page (default 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<i64>,
    /// Items per page (default 50, max 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<i64>,
    /// Only this environment
    #[serde(skip_serializing_if = "Option::is_none")]
    environment: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct CreateMonitorArgs {
    /// Project ID
    project_id: i32,
    /// Display name (max 128 characters)
    name: String,
    /// Slug; from the name when omitted
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<String>,
    /// Config; schedule is required
    config: ConfigArg,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct UpdateMonitorArgs {
    #[serde(flatten)]
    monitor: MonitorArgs,
    /// New name
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    /// Config fields to change
    #[serde(skip_serializing_if = "Option::is_none")]
    config: Option<ConfigArg>,
    /// Mute or unmute
    #[serde(skip_serializing_if = "Option::is_none")]
    is_muted: Option<bool>,
}

#[tool_router(router = monitor_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "List the cron monitors of a project (Sentry Crons): each scheduled job with its schedule, config, and per-environment status (active = waiting for a first ok run, ok, error = incident open) with its recent check-ins.",
        annotations(read_only_hint = true)
    )]
    async fn list_monitors(&self, Parameters(a): Parameters<ProjectArgs>) -> CallToolResult {
        reply(monitors::list_monitors(
            self.pool(),
            web::Path::from(a.project_id),
            self.actor(),
        ))
        .await
    }

    #[tool(
        description = "Get one cron monitor by slug: its config, environments, last and next expected check-in, and recent check-ins.",
        annotations(read_only_hint = true)
    )]
    async fn get_monitor(&self, Parameters(a): Parameters<MonitorArgs>) -> CallToolResult {
        reply(monitors::get_monitor(self.pool(), a.path(), self.actor())).await
    }

    #[tool(
        description = "List the check-ins of a cron monitor, newest first. status is ok, error, in_progress, missed, timeout or unknown; missed and timeout are set by Rustrak when a run did not report on time.",
        annotations(read_only_hint = true)
    )]
    async fn list_monitor_checkins(
        &self,
        Parameters(a): Parameters<CheckinsArgs>,
    ) -> CallToolResult {
        reply(async {
            monitors::list_checkins(
                self.pool(),
                a.monitor.path(),
                web::Query(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Create a cron monitor. Its slug (derived from the name when omitted) is what the job checks in with. Most monitors are instead created by the job itself, by sending a monitor_config with its first check-in.",
        annotations(destructive_hint = false)
    )]
    async fn create_monitor(&self, Parameters(a): Parameters<CreateMonitorArgs>) -> CallToolResult {
        reply(async {
            monitors::create_monitor(
                self.pool(),
                web::Path::from(a.project_id),
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Rename, reconfigure, mute or unmute a cron monitor. Config fields left out keep their value. A muted monitor still records check-ins but opens no issue and sends no alert.",
        annotations(destructive_hint = false)
    )]
    async fn update_monitor(&self, Parameters(a): Parameters<UpdateMonitorArgs>) -> CallToolResult {
        reply(async {
            monitors::update_monitor(
                self.pool(),
                a.monitor.path(),
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Permanently delete a cron monitor and its check-ins. The issues it opened stay. A job that keeps checking in with a monitor_config creates it again.",
        annotations(destructive_hint = true)
    )]
    async fn delete_monitor(&self, Parameters(a): Parameters<MonitorArgs>) -> CallToolResult {
        done(
            monitors::delete_monitor(self.pool(), a.path(), self.actor()),
            format!("Monitor {} deleted.", a.slug),
        )
        .await
    }
}
