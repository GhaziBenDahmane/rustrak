//! The PostHog adapter: one `heartbeat` event per report, the instance id as
//! `distinct_id`, the report as event properties, GeoIP switched off.

use async_trait::async_trait;
use serde_json::{json, Value};

use super::report::{Report, Sink, SinkError};

/// PostHog Cloud EU, single-event capture.
pub const ENDPOINT: &str = "https://eu.i.posthog.com/i/v0/e/";

/// How the sink is named to operators, in the startup line and the preview.
/// The vendor is an implementation detail and stays out of the docs.
pub const SINK_NAME: &str = "the Rustrak telemetry store";

/// The project token, baked in at build time from the `RUSTRAK_TELEMETRY_KEY`
/// environment variable. `None` in a build that did not set it.
pub fn compiled_key() -> Option<&'static str> {
    option_env!("RUSTRAK_TELEMETRY_KEY")
}

pub struct PostHogSink {
    endpoint: String,
    api_key: String,
    client: reqwest::Client,
}

impl PostHogSink {
    pub fn new(endpoint: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            api_key: api_key.into(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }

    /// The exact JSON PostHog receives.
    pub fn envelope(&self, report: &Report) -> Value {
        let mut properties = serde_json::to_value(report).unwrap_or_else(|_| json!({}));
        properties["$geoip_disable"] = json!(true);
        properties["$set"] = json!({
            "version": report.version,
            "os": report.os,
            "arch": report.arch,
            "container": report.container,
            "db_backend": report.db_backend,
        });
        json!({
            "api_key": self.api_key,
            "event": "heartbeat",
            "distinct_id": report.instance_id,
            "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "properties": properties,
        })
    }
}

#[async_trait]
impl Sink for PostHogSink {
    fn name(&self) -> &'static str {
        SINK_NAME
    }

    async fn send(&self, report: &Report) -> Result<(), SinkError> {
        let response = self
            .client
            .post(&self.endpoint)
            .json(&self.envelope(report))
            .send()
            .await
            .map_err(|e| SinkError::Transport(e.to_string()))?;
        let status = response.status();
        if status.is_success() {
            Ok(())
        } else {
            Err(SinkError::Status(status.as_u16()))
        }
    }
}
