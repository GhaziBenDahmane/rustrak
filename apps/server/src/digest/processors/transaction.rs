use super::span::{insert_span_rows, SpanRow};
use super::{clamp, clamp_opt, extract_timestamp, is_stale, relay_level, Processor, ProcessorCtx};
use crate::error::{AppError, AppResult};
use crate::services::gen_ai::{extract_gen_ai_columns, GenAiColumns};
use bytes::Bytes;
use uuid::Uuid;

pub struct TransactionProcessor;

impl Processor for TransactionProcessor {
    type Input = Bytes;

    /// Store a transaction payload into the dedicated `transactions` table.
    /// Does NOT create an issue, grouping, or source-map rewrite.
    async fn process(&self, work: Bytes, ctx: &ProcessorCtx) -> AppResult<()> {
        // Reject malformed payloads instead of persisting a null-data row.
        // The ingest route propagates this error so the SDK can retry the envelope.
        let mut data: serde_json::Value = serde_json::from_slice(&work)
            .map_err(|e| AppError::Validation(format!("Invalid transaction JSON: {}", e)))?;

        // Relay drops a transaction from before 1970, and removes such spans.
        if is_stale(&data, "timestamp") || is_stale(&data, "start_timestamp") {
            return Err(AppError::Validation(
                "transaction timestamp is before 1970".to_string(),
            ));
        }
        if let Some(spans) = data.get_mut("spans").and_then(|s| s.as_array_mut()) {
            spans.retain(|span| !is_stale(span, "start_timestamp") && !is_stale(span, "timestamp"));
        }

        let timestamp = extract_timestamp(&data, "timestamp").unwrap_or(ctx.ingested_at);
        let start_timestamp = extract_timestamp(&data, "start_timestamp");
        // Relay: `transaction` max_chars = 200.
        let transaction_name = extract_str(&data, "transaction", 200);

        // Denormalize the trace context (contexts.trace.*) into queryable columns
        // — mirrors Relay, which surfaces op/status/span_id for performance views.
        let trace = data.get("contexts").and_then(|c| c.get("trace"));
        let trace_id = trace_str(trace, "trace_id", 64);
        let span_id = trace_str(trace, "span_id", 32);
        let parent_span_id = trace_str(trace, "parent_span_id", 32);
        let op = trace_str(trace, "op", 64);
        let status = trace_str(trace, "status", 32);
        // transaction_info.source carries Relay's TransactionSource. Stored
        // verbatim (Relay keeps unrecognized values via its `Other(String)`
        // variant); defaults to "unknown" when the SDK omits transaction_info.
        let source = clamp(
            data.get("transaction_info")
                .and_then(|ti| ti.get("source"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown"),
            32,
        );

        // Precompute duration at write time (milliseconds, microsecond precision).
        let duration_ms = start_timestamp.and_then(|st| {
            (timestamp - st)
                .num_microseconds()
                .map(|us| (us as f64 / 1000.0).max(0.0))
        });

        // Denormalize the fields the list/detail views surface so they don't
        // have to parse the JSON payload on every read.
        let platform = extract_str(&data, "platform", 64);
        // Relay: `release` max_chars = 200, `environment` 64.
        let release = extract_str(&data, "release", 200);
        let environment = extract_str(&data, "environment", 64);
        let server_name = extract_str(&data, "server_name", 255);
        let level = data
            .get("level")
            .and_then(|v| v.as_str())
            .and_then(relay_level)
            .unwrap_or("info");
        let sdk = data.get("sdk").unwrap_or(&serde_json::Value::Null);
        let sdk_name = extract_str(sdk, "name", 255);
        let sdk_version = extract_str(sdk, "version", 255);

        let id = Uuid::new_v4();

        // Parent transaction + its extracted spans are written in one DB
        // transaction, and a retry with the same event id is a no-op.
        let mut tx = ctx.pool.begin().await?;

        let inserted = sqlx::query(
            r#"
            INSERT INTO transactions (
                id, event_id, project_id,
                transaction_name,
                trace_id, span_id, parent_span_id, op, status, source,
                start_timestamp, timestamp, duration_ms,
                platform, environment, release, server_name,
                sdk_name, sdk_version, level,
                data, remote_addr, ingested_at
            ) VALUES (
                $1, $2, $3,
                $4,
                $5, $6, $7, $8, $9, $10,
                $11, $12, $13,
                $14, $15, $16, $17,
                $18, $19, $20,
                $21, $22, $23
            )
            ON CONFLICT (project_id, event_id) DO NOTHING
            "#,
        )
        .bind(id)
        .bind(ctx.event_id)
        .bind(ctx.project_id)
        .bind(&transaction_name)
        .bind(trace_id.as_deref())
        .bind(span_id.as_deref())
        .bind(parent_span_id.as_deref())
        .bind(op.as_deref())
        .bind(status.as_deref())
        .bind(source)
        .bind(start_timestamp)
        .bind(timestamp)
        .bind(duration_ms)
        .bind(&platform)
        .bind(&environment)
        .bind(&release)
        .bind(server_name)
        .bind(sdk_name)
        .bind(sdk_version)
        .bind(level)
        .bind(sqlx::types::Json(&data))
        .bind(ctx.remote_addr.as_deref())
        .bind(ctx.ingested_at)
        .execute(&mut *tx)
        .await?;

        if inserted.rows_affected() == 0 {
            return Ok(());
        }

        // Extract each span into the indexed `spans` table. Mirrors Relay's span
        // extraction (DataCategory::SpanIndexed): individually queryable rows
        // linked to the parent transaction. A span inherits the transaction's
        // trace_id when it doesn't carry its own. The parent transaction was
        // already serialized above, so the spans can be moved out of `data`.
        let spans = data
            .get_mut("spans")
            .and_then(|s| s.as_array_mut())
            .map(std::mem::take)
            .unwrap_or_default();
        let mut rows: Vec<SpanRow> = spans
            .into_iter()
            .map(|span| {
                span_row(
                    span,
                    id,
                    trace_id.as_deref(),
                    non_empty(&platform),
                    non_empty(&release),
                    non_empty(&environment),
                )
            })
            .collect();

        // Promote contexts.trace into its own `spans` row when it's an
        // AI-instrumented trace root. Some SDKs (verified: @sentry/node +
        // Vercel AI SDK's vercelAIIntegration()) send the trace's root span
        // ("invoke_agent") inline on the transaction event's contexts.trace
        // — never as its own span item in `spans[]` — carrying
        // client-accumulated token totals in contexts.trace.data. Without
        // this, gen_ai_operation_type='agent' aggregations (the "Agent Runs"
        // widget) never see it, even though other AI spans in the same trace
        // do. Gated on is_ai_span (via extract_gen_ai_columns's own check) so
        // an ordinary, non-AI transaction's span count is unaffected —
        // verified live against a real captured trace, 2026-07-17.
        if let (Some(root_span_id), Some(root_trace_id)) = (&span_id, &trace_id) {
            let trace_context = data
                .get_mut("contexts")
                .and_then(|contexts| contexts.get_mut("trace"));
            let trace_context = trace_context.ok_or_else(|| {
                AppError::Validation("transaction trace context is missing".to_string())
            })?;
            let gen_ai = match trace_context.as_object_mut() {
                Some(trace) => {
                    let trace_data = trace.entry("data").or_insert_with(|| serde_json::json!({}));
                    extract_gen_ai_columns(trace_data, op.as_deref())
                }
                None => GenAiColumns::default(),
            };
            if gen_ai.operation_type.is_some() {
                // The whole `contexts.trace` object is the row's `data`, so
                // gen_ai fields sit at `$.data.gen_ai.*`.
                rows.push(SpanRow {
                    transaction_id: Some(id),
                    span_id: Some(root_span_id.clone()),
                    trace_id: Some(root_trace_id.clone()),
                    start_timestamp,
                    timestamp: Some(timestamp),
                    duration_ms,
                    exclusive_time_ms: None,
                    op: op.clone(),
                    gen_ai,
                    parent_span_id: parent_span_id.clone(),
                    description: Some(transaction_name.clone()),
                    status: status.clone(),
                    // The root is its own segment.
                    segment_id: Some(root_span_id.clone()),
                    is_segment: true,
                    // Inherited from the transaction event: contexts.trace
                    // carries none of these, and a promoted root with a NULL
                    // environment would vanish from any environment-filtered
                    // aggregate while its own children survived. `extract_str`
                    // yields "" for an absent field, but the spans table's
                    // nullable columns mean "not reported".
                    platform: non_empty(&platform).map(str::to_string),
                    release: non_empty(&release).map(str::to_string),
                    environment: non_empty(&environment).map(str::to_string),
                    tags: None,
                    data: trace_context.clone(),
                });
            }
        }

        insert_span_rows(&mut tx, ctx.project_id, rows).await?;

        tx.commit().await?;

        Ok(())
    }
}

/// The `spans` row for one child of a transaction. Takes the span by value:
/// gen_ai normalization mutates its `data` attributes bag, which is stored.
fn span_row(
    mut span: serde_json::Value,
    transaction_id: Uuid,
    txn_trace_id: Option<&str>,
    // The parent transaction's scope. `spans.platform/release/environment`
    // were originally documented as "standalone spans only, a child inherits
    // from its transaction row" — true for a JOIN, but the agents dashboard
    // filters `spans` directly, so leaving them NULL drops every
    // transaction-embedded AI span from an environment-filtered view.
    platform: Option<&str>,
    release: Option<&str>,
    environment: Option<&str>,
) -> SpanRow {
    let span_id = trace_str(Some(&span), "span_id", 32);
    let parent_span_id = trace_str(Some(&span), "parent_span_id", 32);
    // Relay: span `op` max_chars = 128. `description` is TEXT.
    let op = trace_str(Some(&span), "op", 128);
    let description = span
        .get("description")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let status = trace_str(Some(&span), "status", 32);
    let segment_id = trace_str(Some(&span), "segment_id", 32);
    let is_segment = span
        .get("is_segment")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // A span carries its own trace_id only rarely; inherit the transaction's.
    let trace_id =
        trace_str(Some(&span), "trace_id", 64).or_else(|| txn_trace_id.map(str::to_string));

    let start_timestamp = extract_timestamp(&span, "start_timestamp");
    let timestamp = extract_timestamp(&span, "timestamp");
    let duration_ms = match (start_timestamp, timestamp) {
        (Some(st), Some(ts)) => (ts - st)
            .num_microseconds()
            .map(|us| (us as f64 / 1000.0).max(0.0)),
        _ => None,
    };
    // Relay's exclusive_time is already in milliseconds.
    let exclusive_time_ms = span.get("exclusive_time").and_then(|v| v.as_f64());

    // The spec promises an object; anything else is dropped.
    let tags = span.get("tags").filter(|t| t.is_object()).cloned();

    // gen_ai.* normalization, on the span's own `data` attributes bag —
    // same shared function `SpanProcessor` calls for standalone spans, so
    // a transaction-embedded LLM-call child span is normalized identically.
    let gen_ai = match span.get_mut("data") {
        Some(span_data) => extract_gen_ai_columns(span_data, op.as_deref()),
        None => GenAiColumns::default(),
    };

    SpanRow {
        transaction_id: Some(transaction_id),
        span_id,
        trace_id,
        start_timestamp,
        timestamp,
        duration_ms,
        exclusive_time_ms,
        op,
        gen_ai,
        parent_span_id,
        description,
        status,
        segment_id,
        is_segment,
        platform: platform.map(str::to_string),
        release: release.map(str::to_string),
        environment: environment.map(str::to_string),
        tags,
        data: span,
    }
}

/// Extracts a top-level string field from the payload, defaulting to empty.
/// `None` for the empty string `extract_str` returns when a field is absent.
fn non_empty(value: &str) -> Option<&str> {
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn extract_str(data: &serde_json::Value, key: &str, max_chars: usize) -> String {
    clamp(
        data.get(key).and_then(|v| v.as_str()).unwrap_or(""),
        max_chars,
    )
}

/// Reads a string field from the `contexts.trace` object, if present.
/// Returns `None` for a missing trace, missing key, or non-string value —
/// so the column stays NULL rather than storing `""`.
fn trace_str(trace: Option<&serde_json::Value>, key: &str, max_chars: usize) -> Option<String> {
    clamp_opt(
        trace
            .and_then(|t| t.get(key))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        max_chars,
    )
}
