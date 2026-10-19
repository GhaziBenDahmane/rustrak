use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::{args, reply, RustrakMcp};
use crate::routes::logs;

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ListLogsArgs {
    /// Project ID
    project_id: i32,
    /// Page number (1-indexed, default 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<i64>,
    /// Items per page (default 20, max 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<i64>,
    /// Filter by log level, e.g. error
    #[serde(skip_serializing_if = "Option::is_none")]
    level: Option<String>,
    /// Filter by trace id (all logs for one trace)
    #[serde(skip_serializing_if = "Option::is_none")]
    trace_id: Option<String>,
}

#[tool_router(router = log_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "List standalone logs for a Rustrak project (newest first by log timestamp), with offset pagination and optional filters. Each log includes its level, body (message), trace_id/span_id for correlation, severity number, and arbitrary attributes. Filter by level (trace/debug/info/warn/error/fatal) or by trace_id to see all logs for one trace.",
        annotations(read_only_hint = true)
    )]
    async fn list_logs(&self, Parameters(a): Parameters<ListLogsArgs>) -> CallToolResult {
        reply(async {
            logs::list_logs(
                self.pool(),
                web::Path::from(a.project_id),
                web::Query(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }
}
