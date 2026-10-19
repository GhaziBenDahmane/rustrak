use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{args, done, reply, uuid, RustrakMcp};
use crate::error::AppResult;
use crate::routes::issues;

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct IssueArgs {
    /// Project ID
    project_id: i32,
    /// Issue ID
    issue_id: String,
}

impl IssueArgs {
    fn path(&self) -> AppResult<web::Path<(i32, uuid::Uuid)>> {
        Ok(web::Path::from((
            self.project_id,
            uuid("issue_id", &self.issue_id)?,
        )))
    }
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ListIssuesArgs {
    /// Project ID
    project_id: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<i64>,
    /// Items per page (max 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<i64>,
    /// Filter issues by state: open (default), resolved, muted or all
    #[serde(skip_serializing_if = "Option::is_none")]
    filter: Option<String>,
    /// Free-text search across type, value, transaction, culprit
    #[serde(skip_serializing_if = "Option::is_none")]
    q: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct UpdateStatusArgs {
    #[serde(flatten)]
    issue: IssueArgs,
    /// New status: unresolved, resolved, ignored or resolvedInNextRelease
    status: String,
    /// low, medium or high
    #[serde(skip_serializing_if = "Option::is_none")]
    priority: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct AssignArgs {
    #[serde(flatten)]
    issue: IssueArgs,
    /// User ID to assign, or null to clear
    assigned_to: Option<i32>,
    /// e.g. "user" or "team"
    assignee_type: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct BulkUpdateArgs {
    /// Project ID
    project_id: i32,
    /// Issue IDs to update
    ids: Vec<String>,
    /// unresolved, resolved, ignored or resolvedInNextRelease
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    /// low, medium or high
    #[serde(skip_serializing_if = "Option::is_none")]
    priority: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct BulkDeleteArgs {
    /// Project ID
    project_id: i32,
    /// Issue IDs to delete
    #[serde(skip_serializing_if = "Option::is_none")]
    ids: Option<Vec<String>>,
    /// Delete every issue in this state: open, resolved, muted or all
    #[serde(skip_serializing_if = "Option::is_none")]
    filter: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct TagValuesArgs {
    #[serde(flatten)]
    issue: IssueArgs,
    /// Tag key, e.g. "browser"
    key: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct StatsArgs {
    #[serde(flatten)]
    issue: IssueArgs,
    /// 24h (default) or 30d
    window: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct CommentArgs {
    #[serde(flatten)]
    issue: IssueArgs,
    /// Comment body
    text: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ToggleArgs {
    #[serde(flatten)]
    issue: IssueArgs,
    /// true to turn it on, false to turn it off
    enabled: bool,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct UserReportArgs {
    #[serde(flatten)]
    issue: IssueArgs,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    comments: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    event_id: Option<String>,
}

#[tool_router(router = issue_tools, vis = "pub(super)")]
impl RustrakMcp {
    /// `PATCH` an issue with a fixed body.
    async fn update_issue(&self, a: &IssueArgs, body: serde_json::Value) -> CallToolResult {
        reply(async {
            issues::update_issue(
                self.pool(),
                a.path()?,
                web::Json(args(&body)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "List issues for a Rustrak project. Returns paginated grouped error occurrences.",
        annotations(read_only_hint = true)
    )]
    async fn list_issues(&self, Parameters(a): Parameters<ListIssuesArgs>) -> CallToolResult {
        reply(async {
            issues::list_issues(
                self.pool(),
                web::Path::from(a.project_id),
                web::Query(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Get a single issue by ID.",
        annotations(read_only_hint = true)
    )]
    async fn get_issue(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        reply(async { issues::get_issue(self.pool(), a.path()?, self.actor()).await }).await
    }

    #[tool(
        description = "Mark an issue as resolved.",
        annotations(destructive_hint = false)
    )]
    async fn resolve_issue(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        self.update_issue(&a, json!({ "is_resolved": true })).await
    }

    #[tool(
        description = "Mark a resolved issue as unresolved (re-open it).",
        annotations(destructive_hint = false)
    )]
    async fn unresolve_issue(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        self.update_issue(&a, json!({ "is_resolved": false })).await
    }

    #[tool(
        description = "Mute an issue so it no longer triggers alerts.",
        annotations(destructive_hint = false)
    )]
    async fn mute_issue(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        self.update_issue(&a, json!({ "is_muted": true })).await
    }

    #[tool(
        description = "Permanently delete an issue and all its events.",
        annotations(destructive_hint = true)
    )]
    async fn delete_issue(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        done(
            async { issues::delete_issue(self.pool(), a.path()?, self.actor()).await },
            format!("Issue {} deleted successfully.", a.issue_id),
        )
        .await
    }

    #[tool(
        description = "Set an issue status (unresolved, resolved, ignored, or resolvedInNextRelease) and optionally its priority.",
        annotations(destructive_hint = false)
    )]
    async fn update_issue_status(
        &self,
        Parameters(a): Parameters<UpdateStatusArgs>,
    ) -> CallToolResult {
        reply(async {
            issues::update_issue(
                self.pool(),
                a.issue.path()?,
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Assign an issue to a user (or clear the assignment with assigned_to=null).",
        annotations(destructive_hint = false)
    )]
    async fn assign_issue(&self, Parameters(a): Parameters<AssignArgs>) -> CallToolResult {
        // `null` must reach the handler, which reads it as "clear".
        let body = json!({ "assigned_to": a.assigned_to, "assignee_type": a.assignee_type });
        reply(async {
            issues::update_issue(
                self.pool(),
                a.issue.path()?,
                web::Json(args(&body)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Set the status and/or priority of multiple issues at once.",
        annotations(destructive_hint = false)
    )]
    async fn bulk_update_issues(
        &self,
        Parameters(a): Parameters<BulkUpdateArgs>,
    ) -> CallToolResult {
        reply(async {
            issues::bulk_update_issues(
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
        description = "Permanently delete issues and all their events. Specify exactly one of ids or filter; filter=all deletes every issue in the project.",
        annotations(destructive_hint = true)
    )]
    async fn bulk_delete_issues(
        &self,
        Parameters(a): Parameters<BulkDeleteArgs>,
    ) -> CallToolResult {
        if a.ids.is_some() == a.filter.is_some() {
            return super::refuse("Specify exactly one of ids or filter.");
        }
        // The handler's body refuses any field but the one it names.
        let body = match &a.ids {
            Some(ids) => json!({ "ids": ids }),
            None => json!({ "filter": a.filter }),
        };
        reply(async {
            issues::delete_issues(
                self.pool(),
                a.project_id,
                args(&body).map(web::Json),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "List the grouping hashes that map to an issue.",
        annotations(read_only_hint = true)
    )]
    async fn get_issue_hashes(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        reply(async { issues::get_issue_hashes(self.pool(), a.path()?, self.actor()).await }).await
    }

    #[tool(
        description = "List the distinct values (with counts) for a tag key across an issue.",
        annotations(read_only_hint = true)
    )]
    async fn get_issue_tag_values(
        &self,
        Parameters(a): Parameters<TagValuesArgs>,
    ) -> CallToolResult {
        reply(async {
            let (project_id, issue_id) = a.issue.path()?.into_inner();
            issues::get_issue_tag_values(
                self.pool(),
                web::Path::from((project_id, issue_id, a.key.clone())),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Get per-issue aggregates: unique affected user count and top tags.",
        annotations(read_only_hint = true)
    )]
    async fn get_issue_aggregates(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        reply(async { issues::get_issue_aggregates(self.pool(), a.path()?, self.actor()).await })
            .await
    }

    #[tool(
        description = "Get an event-count timeseries for an issue (24h or 30d).",
        annotations(read_only_hint = true)
    )]
    async fn get_issue_stats(&self, Parameters(a): Parameters<StatsArgs>) -> CallToolResult {
        let query = [(
            "window".to_string(),
            a.window.clone().unwrap_or("24h".into()),
        )];
        reply(async {
            issues::get_issue_stats(
                self.pool(),
                a.issue.path()?,
                web::Query(query.into_iter().collect()),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "List an issue's activity log (status changes, comments/notes, …).",
        annotations(read_only_hint = true)
    )]
    async fn get_issue_activity(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        reply(async { issues::get_issue_activity(self.pool(), a.path()?, self.actor()).await })
            .await
    }

    #[tool(
        description = "Add a comment (note) to an issue.",
        annotations(destructive_hint = false)
    )]
    async fn comment_on_issue(&self, Parameters(a): Parameters<CommentArgs>) -> CallToolResult {
        reply(async {
            issues::create_issue_comment(
                self.pool(),
                a.issue.path()?,
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Set or clear your bookmark on an issue.",
        annotations(destructive_hint = false)
    )]
    async fn bookmark_issue(&self, Parameters(a): Parameters<ToggleArgs>) -> CallToolResult {
        reply(async {
            issues::set_issue_bookmark(
                self.pool(),
                a.issue.path()?,
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Subscribe to or unsubscribe from an issue.",
        annotations(destructive_hint = false)
    )]
    async fn subscribe_issue(&self, Parameters(a): Parameters<ToggleArgs>) -> CallToolResult {
        reply(async {
            issues::set_issue_subscription(
                self.pool(),
                a.issue.path()?,
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Mark an issue as seen by you.",
        annotations(destructive_hint = false)
    )]
    async fn mark_issue_seen(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        reply(async { issues::mark_issue_seen(self.pool(), a.path()?, self.actor()).await }).await
    }

    #[tool(
        description = "List user feedback reports attached to an issue.",
        annotations(read_only_hint = true)
    )]
    async fn list_user_reports(&self, Parameters(a): Parameters<IssueArgs>) -> CallToolResult {
        reply(async { issues::list_issue_user_reports(self.pool(), a.path()?, self.actor()).await })
            .await
    }

    #[tool(
        description = "Attach a user feedback report to an issue.",
        annotations(destructive_hint = false)
    )]
    async fn submit_user_report(
        &self,
        Parameters(a): Parameters<UserReportArgs>,
    ) -> CallToolResult {
        reply(async {
            issues::create_issue_user_report(
                self.pool(),
                a.issue.path()?,
                web::Json(args(&a)?),
                self.actor(),
            )
            .await
        })
        .await
    }
}
