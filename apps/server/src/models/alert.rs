//! Alert models for the notification system.
//!
//! This module contains models for alert integrations (global credentials),
//! alert rules (per-project triggers), and alert history (audit log).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;
use uuid::Uuid;

// =============================================================================
// Provider Type Enum
// =============================================================================

/// Type of notification provider (replaces ChannelType)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Webhook,
    Email,
    Slack,
    // Explicit renames: the container-level `lowercase` would silently produce
    // "customwebhook" from the variant name. The wire/DB string is
    // `custom_webhook` everywhere (CHECK constraints, client enum, i18n).
    #[serde(rename = "custom_webhook")]
    #[sqlx(rename = "custom_webhook")]
    CustomWebhook,
}

/// Legacy alias so existing code using ChannelType still compiles.
pub type ChannelType = ProviderType;

impl std::fmt::Display for ProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderType::Webhook => write!(f, "webhook"),
            ProviderType::Email => write!(f, "email"),
            ProviderType::Slack => write!(f, "slack"),
            ProviderType::CustomWebhook => write!(f, "custom_webhook"),
        }
    }
}

// =============================================================================
// Alert Type Enum
// =============================================================================

/// Type of alert trigger
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
#[sqlx(type_name = "varchar", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum AlertType {
    NewIssue,
    Regression,
    Unmute,
    /// A user feedback was submitted (each feedback is its own issue).
    NewFeedback,
}

impl std::fmt::Display for AlertType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertType::NewIssue => write!(f, "new_issue"),
            AlertType::Regression => write!(f, "regression"),
            AlertType::Unmute => write!(f, "unmute"),
            AlertType::NewFeedback => write!(f, "new_feedback"),
        }
    }
}

// =============================================================================
// Alert Status Enum
// =============================================================================

/// Status of an alert delivery attempt
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
#[sqlx(type_name = "varchar", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AlertStatus {
    Pending,
    Sent,
    Failed,
    Skipped,
}

// =============================================================================
// Alert Integration Model (replaces NotificationChannel)
// =============================================================================

/// Global alert integration record — stores credentials only, no routing.
#[derive(Debug, Clone, Serialize, FromRow)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AlertIntegration {
    pub id: i32,
    pub name: String,
    pub provider_type: ProviderType,
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub credentials: serde_json::Value,
    pub is_enabled: bool,
    pub failure_count: i32,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub last_failure_at: Option<DateTime<Utc>>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub last_failure_message: Option<String>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub last_success_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Legacy alias so existing code referencing NotificationChannel still compiles.
pub type NotificationChannel = AlertIntegration;

/// DTO for creating an alert integration
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct CreateAlertIntegration {
    pub name: String,
    pub provider_type: ProviderType,
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub credentials: serde_json::Value,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
}

/// Legacy alias
pub type CreateNotificationChannel = CreateAlertIntegration;

/// DTO for updating an alert integration
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct UpdateAlertIntegration {
    pub name: Option<String>,
    #[cfg_attr(feature = "openapi", schema(value_type = Option<Object>))]
    pub credentials: Option<serde_json::Value>,
    pub is_enabled: Option<bool>,
}

/// Legacy alias
pub type UpdateNotificationChannel = UpdateAlertIntegration;

fn default_true() -> bool {
    true
}

// =============================================================================
// Routing Override Flat Structs (NO serde tag — SCL-1)
//
// routing_override JSON never carries a `provider_type` discriminator field.
// validate_routing_override uses `match provider_type` and deserializes into
// the appropriate flat struct. These structs must NOT use #[serde(tag)].
// =============================================================================

/// Per-rule routing override for Slack integrations.
///
/// For bot_token method: channel is required; username and icon_emoji are optional.
/// For webhook method: routing_override is always `{}`.
///
/// **No `provider_type` field in JSON** — deserialized using known provider type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackRoutingOverride {
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub icon_emoji: Option<String>,
}

/// Per-rule routing override for Email integrations.
///
/// recipients is required and must contain at least one valid address.
///
/// **No `provider_type` field in JSON** — deserialized using known provider type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailRoutingOverride {
    #[serde(default)]
    pub recipients: Vec<String>,
}

/// Per-rule routing override for Webhook and Custom Webhook integrations.
///
/// url overrides the credential-level url when present.
/// extra_headers are merged with (and override) credential-level headers.
///
/// **No `provider_type` field in JSON** — deserialized using known provider type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookRoutingOverride {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub extra_headers: Option<HashMap<String, String>>,
}

// =============================================================================
// Alert Rule Channel Junction
// =============================================================================

/// Junction record linking an alert rule to an integration with per-rule routing.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AlertRuleChannel {
    pub alert_rule_id: i32,
    pub integration_id: i32,
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub routing_override: serde_json::Value,
}

// =============================================================================
// Credentials Config Types (for validation and dispatcher use)
// =============================================================================

/// Webhook integration credentials
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookConfig {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub secret: Option<String>,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
}

/// Custom Webhook integration credentials.
///
/// Same delivery as [`WebhookConfig`] plus a user-supplied Minijinja template
/// that renders the request body from the [`AlertPayload`] context. The
/// rendered result must be valid JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomWebhookConfig {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub secret: Option<String>,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
    pub template: String,
}

/// Email integration credentials
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailConfig {
    #[serde(default)]
    pub smtp_host: Option<String>,
    #[serde(default)]
    pub smtp_port: Option<u16>,
    #[serde(default)]
    pub smtp_username: Option<String>,
    #[serde(default)]
    pub smtp_password: Option<String>,
    #[serde(default)]
    pub from_address: Option<String>,
}

/// Slack credentials — tagged enum over delivery method.
///
/// Serialises as `{"method":"webhook",...}` or `{"method":"bot_token",...}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum SlackConfig {
    Webhook(SlackWebhookConfig),
    BotToken(SlackBotTokenConfig),
}

/// Config for the Incoming Webhook delivery method.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackWebhookConfig {
    pub webhook_url: String,
}

/// Config for the Bot Token (chat.postMessage) delivery method.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackBotTokenConfig {
    pub token: String,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub icon_emoji: Option<String>,
}

// =============================================================================
// Alert Rule Model
// =============================================================================

/// Per-project alert rule configuration
#[derive(Debug, Clone, Serialize, FromRow)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AlertRule {
    pub id: i32,
    pub project_id: i32,
    pub name: String,
    pub alert_type: AlertType,
    pub is_enabled: bool,
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub conditions: serde_json::Value,
    pub cooldown_minutes: i32,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub last_triggered_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// DTO for creating an alert rule
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct CreateAlertRule {
    pub name: String,
    pub alert_type: AlertType,
    #[serde(default = "default_conditions")]
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub conditions: serde_json::Value,
    #[serde(default)]
    pub cooldown_minutes: i32,
    #[serde(default)]
    pub channels: Vec<AlertRuleChannelInput>,
}

fn default_conditions() -> serde_json::Value {
    serde_json::json!({})
}

/// DTO for a channel with routing override in rule create/update
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AlertRuleChannelInput {
    pub integration_id: i32,
    #[serde(default = "default_empty_object")]
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub routing_override: serde_json::Value,
}

fn default_empty_object() -> serde_json::Value {
    serde_json::json!({})
}

/// DTO for updating an alert rule
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct UpdateAlertRule {
    pub name: Option<String>,
    pub is_enabled: Option<bool>,
    #[cfg_attr(feature = "openapi", schema(value_type = Option<Object>))]
    pub conditions: Option<serde_json::Value>,
    pub cooldown_minutes: Option<i32>,
    pub channels: Option<Vec<AlertRuleChannelInput>>,
}

/// Response for alert rule including linked integration info
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AlertRuleResponse {
    pub id: i32,
    pub project_id: i32,
    pub name: String,
    pub alert_type: AlertType,
    pub is_enabled: bool,
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub conditions: serde_json::Value,
    pub cooldown_minutes: i32,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub last_triggered_at: Option<DateTime<Utc>>,
    /// All linked integrations including routing_override per channel.
    pub channels: Vec<AlertRuleChannelInput>,
    /// Flat list of integration IDs (backward compat, derived from channels).
    pub integration_ids: Vec<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl AlertRule {
    /// Converts to response. `channels` includes routing_override per integration;
    /// `integration_ids` is derived from it for backward compat.
    pub fn to_response(&self, channels: Vec<AlertRuleChannelInput>) -> AlertRuleResponse {
        let integration_ids = channels.iter().map(|c| c.integration_id).collect();
        AlertRuleResponse {
            id: self.id,
            project_id: self.project_id,
            name: self.name.clone(),
            alert_type: self.alert_type,
            is_enabled: self.is_enabled,
            conditions: self.conditions.clone(),
            cooldown_minutes: self.cooldown_minutes,
            last_triggered_at: self.last_triggered_at,
            channels,
            integration_ids,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

// =============================================================================
// Rule Conditions
// =============================================================================

/// Levels from quietest to loudest, the order `min_level` compares in.
const LEVELS: [&str; 5] = ["debug", "info", "warning", "error", "fatal"];

/// The filters a rule's `conditions` hold. Every one is optional; a rule with
/// none fires the way rules always did.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RuleConditions {
    /// The quietest level that still fires.
    pub min_level: Option<String>,
    /// When non-empty, the only environments that fire.
    #[serde(default)]
    pub environments: Vec<String>,
    /// A new issue fires on the event that brings it to this count instead of
    /// on its first one.
    pub min_events: Option<i32>,
}

impl RuleConditions {
    pub fn parse(value: &serde_json::Value) -> crate::error::AppResult<Self> {
        let invalid = |e: String| crate::error::AppError::Validation(format!("conditions: {e}"));
        let conditions: Self =
            serde_json::from_value(value.clone()).map_err(|e| invalid(e.to_string()))?;
        if let Some(level) = &conditions.min_level {
            if !LEVELS.contains(&level.as_str()) {
                return Err(invalid(format!("unknown level '{level}'")));
            }
        }
        if conditions.min_events.is_some_and(|n| n < 1) {
            return Err(invalid("min_events must be at least 1".into()));
        }
        Ok(conditions)
    }

    /// Whether an event with this level and environment, being the issue's
    /// `event_count`th, fires a rule of `alert_type`.
    pub fn matches(
        &self,
        alert_type: AlertType,
        level: Option<&str>,
        environment: Option<&str>,
        event_count: i32,
    ) -> bool {
        let rank = |l: &str| LEVELS.iter().position(|x| *x == l);
        // An event without a level is an error, as Sentry stores it.
        let level_ok = self
            .min_level
            .as_deref()
            .is_none_or(|min| rank(level.unwrap_or("error")) >= rank(min));
        let environment_ok = self.environments.is_empty()
            || environment.is_some_and(|e| self.environments.iter().any(|x| x == e));
        let count_ok =
            alert_type != AlertType::NewIssue || event_count == self.min_events.unwrap_or(1).max(1);
        level_ok && environment_ok && count_ok
    }
}

// =============================================================================
// Alert History Model
// =============================================================================

/// Alert delivery history record (audit log and retry queue)
#[derive(Debug, Clone, Serialize, FromRow)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AlertHistory {
    pub id: i64,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub alert_rule_id: Option<i32>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub integration_id: Option<i32>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub issue_id: Option<Uuid>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub project_id: Option<i32>,
    pub alert_type: String,
    pub channel_type: String,
    pub channel_name: String,
    #[serde(skip_serializing)]
    #[cfg_attr(feature = "openapi", schema(value_type = Object))]
    pub payload: serde_json::Value,
    pub status: AlertStatus,
    pub attempt_count: i32,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub next_retry_at: Option<DateTime<Utc>>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub error_message: Option<String>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub http_status_code: Option<i32>,
    pub idempotency_key: String,
    pub created_at: DateTime<Utc>,
    #[cfg_attr(feature = "openapi", schema(required))]
    pub sent_at: Option<DateTime<Utc>>,
}

// =============================================================================
// Alert Payload (for notifications)
// =============================================================================

/// Payload sent to notification integrations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertPayload {
    /// Unique alert ID for idempotency
    pub alert_id: String,
    /// Type of alert (new_issue, regression, unmute)
    pub alert_type: String,
    /// Timestamp when alert was triggered
    pub triggered_at: DateTime<Utc>,
    /// Project information
    pub project: ProjectInfo,
    /// Issue information
    pub issue: IssueInfo,
    /// URL to view the issue in the dashboard
    pub issue_url: String,
    /// Actor that triggered the alert
    pub actor: String,
}

/// Project information for alert payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub id: i32,
    pub name: String,
    pub slug: String,
}

/// Issue information for alert payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueInfo {
    pub id: String,
    pub short_id: String,
    pub title: String,
    pub level: Option<String>,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub event_count: i32,
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;

    #[test]
    fn custom_webhook_provider_type_is_snake_case_everywhere() {
        // The wire string must match the DB CHECK, the client enum and i18n
        // lookups. Container-level `lowercase` alone would produce
        // "customwebhook"; the explicit variant renames must win.
        assert_eq!(
            serde_json::to_value(ProviderType::CustomWebhook).unwrap(),
            json!("custom_webhook")
        );
        assert_eq!(
            serde_json::from_value::<ProviderType>(json!("custom_webhook")).unwrap(),
            ProviderType::CustomWebhook
        );
        assert_eq!(ProviderType::CustomWebhook.to_string(), "custom_webhook");
    }

    #[test]
    fn alert_history_payload_is_internal_only() {
        let now = Utc::now();
        let history = AlertHistory {
            id: 1,
            alert_rule_id: None,
            integration_id: None,
            issue_id: None,
            project_id: None,
            alert_type: "new_issue".into(),
            channel_type: "webhook".into(),
            channel_name: "test".into(),
            payload: json!({"secret": true}),
            status: AlertStatus::Pending,
            attempt_count: 0,
            next_retry_at: None,
            error_message: None,
            http_status_code: None,
            idempotency_key: "key".into(),
            created_at: now,
            sent_at: None,
        };
        assert!(!serde_json::to_value(history)
            .unwrap()
            .as_object()
            .unwrap()
            .contains_key("payload"));
    }

    // -------------------------------------------------------------------------
    // Task 3 RED→GREEN: Flat routing struct deserialization (NO provider_type tag)
    // -------------------------------------------------------------------------

    #[test]
    fn test_slack_routing_override_with_channel_deserializes() {
        let val = json!({"channel": "#test"});
        let r: SlackRoutingOverride =
            serde_json::from_value(val).expect("SlackRoutingOverride must deserialize");
        assert_eq!(r.channel, Some("#test".to_string()));
        assert!(r.username.is_none());
        assert!(r.icon_emoji.is_none());
    }

    #[test]
    fn test_slack_routing_override_empty_object_is_valid() {
        // Empty routing_override is valid for Slack webhook or when channel is not yet set.
        // Validation happens in the route layer, not at deserialization time.
        let val = json!({});
        let r: SlackRoutingOverride =
            serde_json::from_value(val).expect("empty SlackRoutingOverride must deserialize");
        assert!(r.channel.is_none());
        assert!(r.username.is_none());
        assert!(r.icon_emoji.is_none());
    }

    #[test]
    fn test_email_routing_override_deserializes() {
        let val = json!({"recipients": ["a@b.com", "c@d.com"]});
        let r: EmailRoutingOverride =
            serde_json::from_value(val).expect("EmailRoutingOverride must deserialize");
        assert_eq!(
            r.recipients,
            vec!["a@b.com".to_string(), "c@d.com".to_string()]
        );
    }

    #[test]
    fn test_email_routing_override_empty_recipients_deserializes() {
        // Deserialization succeeds with empty recipients — validation rejects it in route layer.
        let val = json!({"recipients": []});
        let r: EmailRoutingOverride =
            serde_json::from_value(val).expect("must deserialize with empty recipients");
        assert!(r.recipients.is_empty());
    }

    #[test]
    fn test_webhook_routing_override_with_url_deserializes() {
        let val = json!({"url": "https://example.com/hook"});
        let r: WebhookRoutingOverride =
            serde_json::from_value(val).expect("WebhookRoutingOverride must deserialize");
        assert_eq!(r.url, Some("https://example.com/hook".to_string()));
        assert!(r.extra_headers.is_none());
    }

    #[test]
    fn test_webhook_routing_override_empty_deserializes() {
        let val = json!({});
        let r: WebhookRoutingOverride =
            serde_json::from_value(val).expect("empty WebhookRoutingOverride must deserialize");
        assert!(r.url.is_none());
        assert!(r.extra_headers.is_none());
    }

    #[test]
    fn test_routing_structs_have_no_provider_type_field() {
        // Ensure unknown fields are silently ignored (serde default behaviour),
        // so a JSON payload that accidentally includes extra keys won't break deserialization.
        let val = json!({"channel": "#prod", "unexpected_key": true});
        let r: SlackRoutingOverride = serde_json::from_value(val)
            .expect("extra fields in SlackRoutingOverride must be silently ignored");
        assert_eq!(r.channel, Some("#prod".to_string()));
    }

    // -------------------------------------------------------------------------
    // SlackConfig (credentials) still uses #[serde(tag = "method")]
    // -------------------------------------------------------------------------

    #[test]
    fn test_slack_config_bot_token_credentials_deserializes() {
        let val = json!({
            "method": "bot_token",
            "token": "xoxb-123-456"
        });
        let c: SlackConfig = serde_json::from_value(val).expect("must deserialize");
        match c {
            SlackConfig::BotToken(b) => assert_eq!(b.token, "xoxb-123-456"),
            _ => panic!("expected BotToken"),
        }
    }

    #[test]
    fn test_slack_config_webhook_credentials_deserializes() {
        let val = json!({
            "method": "webhook",
            "webhook_url": "https://hooks.slack.com/services/T/B/X"
        });
        let c: SlackConfig = serde_json::from_value(val).expect("must deserialize");
        match c {
            SlackConfig::Webhook(w) => {
                assert_eq!(w.webhook_url, "https://hooks.slack.com/services/T/B/X")
            }
            _ => panic!("expected Webhook"),
        }
    }

    // -------------------------------------------------------------------------
    // RuleConditions
    // -------------------------------------------------------------------------

    fn conditions(value: serde_json::Value) -> RuleConditions {
        RuleConditions::parse(&value).expect("valid conditions")
    }

    #[test]
    fn empty_conditions_fire_new_issues_on_their_first_event() {
        let c = conditions(json!({}));
        assert!(c.matches(AlertType::NewIssue, Some("info"), None, 1));
        assert!(!c.matches(AlertType::NewIssue, Some("info"), None, 2));
        assert!(c.matches(AlertType::Regression, None, None, 40));
    }

    #[test]
    fn min_events_fires_a_new_issue_once_when_it_reaches_the_count() {
        let c = conditions(json!({ "min_events": 10 }));
        assert!(!c.matches(AlertType::NewIssue, None, None, 1));
        assert!(c.matches(AlertType::NewIssue, None, None, 10));
        assert!(!c.matches(AlertType::NewIssue, None, None, 11));
        // A regression is already an issue that matters: the count is not its gate.
        assert!(c.matches(AlertType::Regression, None, None, 3));
    }

    #[test]
    fn min_level_drops_quieter_events_and_unlevelled_ones_count_as_error() {
        let c = conditions(json!({ "min_level": "error" }));
        assert!(c.matches(AlertType::NewIssue, Some("fatal"), None, 1));
        assert!(c.matches(AlertType::NewIssue, Some("error"), None, 1));
        assert!(c.matches(AlertType::NewIssue, None, None, 1));
        assert!(!c.matches(AlertType::NewIssue, Some("warning"), None, 1));
    }

    #[test]
    fn environments_keep_only_the_listed_ones() {
        let c = conditions(json!({ "environments": ["production"] }));
        assert!(c.matches(AlertType::NewIssue, None, Some("production"), 1));
        assert!(!c.matches(AlertType::NewIssue, None, Some("staging"), 1));
        assert!(!c.matches(AlertType::NewIssue, None, None, 1));
    }

    #[test]
    fn invalid_conditions_are_rejected() {
        assert!(RuleConditions::parse(&json!({ "min_level": "loud" })).is_err());
        assert!(RuleConditions::parse(&json!({ "min_events": 0 })).is_err());
        assert!(RuleConditions::parse(&json!({ "environments": "production" })).is_err());
    }
}
