use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::{args, reply, uuid, RustrakMcp};
use crate::routes::events;

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ListEventsArgs {
    /// Project ID
    project_id: i32,
    /// Issue ID
    issue_id: String,
    /// Pagination cursor
    #[serde(skip_serializing_if = "Option::is_none")]
    cursor: Option<String>,
    /// Sort order: asc or desc (default)
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct EventArgs {
    /// Project ID
    project_id: i32,
    /// Issue ID
    issue_id: String,
    /// Event ID
    event_id: String,
}

#[tool_router(router = event_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "List raw events for a specific issue. Events are individual error occurrences within a grouped issue.",
        annotations(read_only_hint = true)
    )]
    async fn list_events(&self, Parameters(a): Parameters<ListEventsArgs>) -> CallToolResult {
        reply(async {
            let path = web::Path::from((a.project_id, uuid("issue_id", &a.issue_id)?));
            events::list_events(self.pool(), path, web::Query(args(&a)?), self.actor()).await
        })
        .await
    }

    #[tool(
        description = "Get full detail for a single event, including the complete Sentry envelope data.",
        annotations(read_only_hint = true)
    )]
    async fn get_event(&self, Parameters(a): Parameters<EventArgs>) -> CallToolResult {
        reply(async {
            let path = web::Path::from((
                a.project_id,
                uuid("issue_id", &a.issue_id)?,
                uuid("event_id", &a.event_id)?,
            ));
            events::get_event(self.pool(), path, self.actor()).await
        })
        .await
    }
}
