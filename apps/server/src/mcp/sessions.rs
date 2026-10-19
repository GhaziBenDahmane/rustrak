use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::{args, reply, RustrakMcp};
use crate::routes::sessions;

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ReleaseHealthArgs {
    /// Project ID
    project_id: i32,
    /// Time window for stats, e.g. '24h', '7d' (default: 24h)
    #[serde(skip_serializing_if = "Option::is_none")]
    period: Option<String>,
    /// Page number, 1-indexed (default: 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<i64>,
    /// Rows per page (default: 20, max: 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<i64>,
}

#[tool_router(router = session_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "Get per-release health stats for a Rustrak project: crash-free session rate, crash-free user rate, and error/crash/abnormal counts. Paginated, ordered by session volume.",
        annotations(read_only_hint = true)
    )]
    async fn get_release_health(
        &self,
        Parameters(a): Parameters<ReleaseHealthArgs>,
    ) -> CallToolResult {
        reply(async {
            sessions::get_stats(
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
