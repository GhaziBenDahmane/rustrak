use actix_web::web;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::schemars::{self, JsonSchema};
use rmcp::{tool, tool_router};
use serde::{Deserialize, Serialize};

use super::{args, reply, NoArgs, ProjectArgs, RustrakMcp};
use crate::routes::alerts;

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct CreateChannelArgs {
    /// Channel name, unique
    name: String,
    /// Provider: slack, email, webhook or custom_webhook
    provider_type: String,
    /// Provider-specific credentials
    credentials: serde_json::Map<String, serde_json::Value>,
    /// Whether alerts are delivered to it (default true)
    #[serde(skip_serializing_if = "Option::is_none")]
    is_enabled: Option<bool>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct UpdateChannelArgs {
    /// Alert channel ID
    channel_id: i32,
    /// New name
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    /// Replacement credentials
    #[serde(skip_serializing_if = "Option::is_none")]
    credentials: Option<serde_json::Map<String, serde_json::Value>>,
    /// Enable or disable
    #[serde(skip_serializing_if = "Option::is_none")]
    is_enabled: Option<bool>,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct TemplateArgs {
    /// JSON body with {{ field }} expressions
    template: String,
}

#[derive(Serialize, Deserialize, JsonSchema)]
pub struct ChannelArgs {
    /// Alert channel ID to test
    channel_id: i32,
}

#[tool_router(router = alert_tools, vis = "pub(super)")]
impl RustrakMcp {
    #[tool(
        description = "List all configured alert notification channels (Slack, email, webhook, custom webhook, etc.).",
        annotations(read_only_hint = true)
    )]
    async fn list_alert_channels(&self, Parameters(_): Parameters<NoArgs>) -> CallToolResult {
        reply(alerts::list_channels(self.pool(), self.actor())).await
    }

    #[tool(
        description = "Create an alert notification channel. provider_type is one of slack, email, webhook, custom_webhook. credentials is provider-specific: a custom_webhook takes { template, url?, secret?, headers? } where template is the JSON body with alert fields written as {{ issue.title }}; values are escaped for wherever they sit. The server validates the credentials and renders the template against a sample alert before saving.",
        annotations(destructive_hint = false)
    )]
    async fn create_alert_channel(
        &self,
        Parameters(a): Parameters<CreateChannelArgs>,
    ) -> CallToolResult {
        reply(async {
            alerts::create_channel(self.pool(), self.actor(), web::Json(args(&a)?)).await
        })
        .await
    }

    #[tool(
        description = "Update an alert notification channel. credentials, when given, replace the stored ones whole, so send every field the provider needs (for a custom_webhook, at least template).",
        annotations(destructive_hint = false)
    )]
    async fn update_alert_channel(
        &self,
        Parameters(a): Parameters<UpdateChannelArgs>,
    ) -> CallToolResult {
        reply(async {
            alerts::update_channel(
                self.pool(),
                self.actor(),
                web::Path::from(a.channel_id),
                web::Json(args(&a)?),
            )
            .await
        })
        .await
    }

    #[tool(
        description = "Render a custom_webhook body template against a sample alert and return the exact body that would be sent, or the reason it would be refused (invalid JSON, unknown field, syntax error). Use it before creating or updating a custom_webhook channel.",
        annotations(read_only_hint = true)
    )]
    async fn preview_alert_template(
        &self,
        Parameters(a): Parameters<TemplateArgs>,
    ) -> CallToolResult {
        reply(async { alerts::preview_template(self.actor(), web::Json(args(&a)?)).await }).await
    }

    #[tool(
        description = "Send a test notification to an alert channel to verify it is configured correctly.",
        annotations(destructive_hint = false)
    )]
    async fn test_alert_channel(&self, Parameters(a): Parameters<ChannelArgs>) -> CallToolResult {
        reply(alerts::test_channel(
            self.pool(),
            self.actor(),
            web::Path::from(a.channel_id),
            None,
        ))
        .await
    }

    #[tool(
        description = "List all alert rules configured for a project.",
        annotations(read_only_hint = true)
    )]
    async fn list_alert_rules(&self, Parameters(a): Parameters<ProjectArgs>) -> CallToolResult {
        reply(alerts::list_rules(
            self.pool(),
            self.actor(),
            web::Path::from(a.project_id),
        ))
        .await
    }
}
