use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::{args, reply, RustrakMcp};
use crate::routes::spans;

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ListSpansArgs {
    /// Project ID
    project_id: i32,
    /// Page number (1-indexed, default 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<i64>,
    /// Items per page (default 20, max 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<i64>,
    /// Filter by span operation, e.g. http.client
    #[serde(skip_serializing_if = "Option::is_none")]
    op: Option<String>,
    /// Filter by span status
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    /// Filter by trace id
    #[serde(skip_serializing_if = "Option::is_none")]
    trace_id: Option<String>,
    /// Filter by gen_ai.operation.type (agent/tool/handoff/ai_client)
    #[serde(skip_serializing_if = "Option::is_none")]
    operation_type: Option<String>,
}

#[tool_router(router = span_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "List spans for a Rustrak project (newest first), with offset pagination and optional filters. Covers spans regardless of origin — standalone \"span\" envelope items and spans extracted from transactions both share this table. Filter by operation_type (agent/tool/handoff/ai_client) to find AI Agent Monitoring spans specifically.",
        annotations(read_only_hint = true)
    )]
    async fn list_spans(&self, Parameters(a): Parameters<ListSpansArgs>) -> CallToolResult {
        reply(async {
            spans::list_spans(
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
