use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::{args, reply, RustrakMcp};
use crate::routes::schedules;

/// A crontab or an interval: the schedule of a cron monitor or a server job.
#[derive(Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(super) enum ScheduleArg {
    Crontab {
        /// Five-field crontab or alias, e.g. "0 3 * * *" or "@daily"
        value: String,
    },
    Interval {
        value: u32,
        /// minute, hour, day, week, month or year
        unit: String,
    },
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct PreviewArgs {
    /// The schedule to preview
    schedule: ScheduleArg,
    /// IANA zone, e.g. Europe/Madrid (default UTC)
    #[serde(skip_serializing_if = "Option::is_none")]
    timezone: Option<String>,
}

#[tool_router(router = schedule_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "Validate a schedule (crontab or interval) and list its next five runs, using the parser Rustrak runs it with. Use it before saving a cron monitor or the automatic cleanup schedule.",
        annotations(read_only_hint = true)
    )]
    async fn preview_schedule(&self, Parameters(a): Parameters<PreviewArgs>) -> CallToolResult {
        reply(async { schedules::preview_schedule(web::Json(args(&a)?), self.actor()).await }).await
    }
}
