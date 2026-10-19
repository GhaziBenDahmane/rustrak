use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::{args, reply, ProjectArgs, RustrakMcp};
use crate::routes::projects;

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ListProjectsArgs {
    /// Page number
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<i64>,
    /// Items per page (max 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<i64>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct CreateProjectArgs {
    /// Project name
    name: String,
    /// URL-safe slug (auto-generated if omitted)
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<String>,
}

#[tool_router(router = project_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "List all Rustrak projects you have access to.",
        annotations(read_only_hint = true)
    )]
    async fn list_projects(&self, Parameters(a): Parameters<ListProjectsArgs>) -> CallToolResult {
        reply(async {
            projects::list_projects(
                self.pool(),
                self.config(),
                web::Query(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Get details for a single Rustrak project.",
        annotations(read_only_hint = true)
    )]
    async fn get_project(&self, Parameters(a): Parameters<ProjectArgs>) -> CallToolResult {
        reply(projects::get_project(
            self.pool(),
            self.config(),
            web::Path::from(a.project_id),
            self.actor(),
        ))
        .await
    }

    #[tool(
        description = "Create a new Rustrak project.",
        annotations(destructive_hint = false)
    )]
    async fn create_project(&self, Parameters(a): Parameters<CreateProjectArgs>) -> CallToolResult {
        reply(async {
            projects::create_project(
                self.pool(),
                self.config(),
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }
}
