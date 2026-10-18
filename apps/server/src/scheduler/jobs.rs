//! The jobs the server schedules.

use actix_web::web;
use async_trait::async_trait;
use chrono_tz::Tz;
use serde_json::{json, Value};

use crate::digest::processors::Processors;
use crate::error::AppResult;
use crate::models::{CleanupState, RetentionSettings};
use crate::scheduler::engine::{JobContext, Misfire, ScheduledJob};
use crate::scheduler::schedule::{IntervalUnit, Schedule};
use crate::services::sourcemap_store::SourceMapStore;
use crate::services::CleanupJob;
use std::sync::Arc;

/// Cron monitors: marks the check-ins that were missed or ran past their max
/// runtime, once a minute, the granularity of every monitor schedule.
pub struct MonitorSweepJob {
    processors: web::Data<Processors>,
}

impl MonitorSweepJob {
    pub const KEY: &'static str = "monitor_sweep";

    pub fn new(processors: web::Data<Processors>) -> Self {
        Self { processors }
    }
}

#[async_trait]
impl ScheduledJob for MonitorSweepJob {
    fn key(&self) -> &'static str {
        Self::KEY
    }

    fn schedule(&self, _settings: &Value) -> Option<(Schedule, Tz)> {
        Some((
            Schedule::Interval {
                value: 1,
                unit: IntervalUnit::Minute,
            },
            Tz::UTC,
        ))
    }

    /// The sweep reads the clock itself and catches up on its own: one run
    /// covers any downtime.
    fn misfire(&self) -> Misfire {
        Misfire::RunOnce
    }

    async fn run(&self, ctx: JobContext<'_>) -> AppResult<Value> {
        let failures =
            crate::routes::ingest::run_monitor_sweep(&self.processors, ctx.pool, ctx.now).await?;
        Ok(json!({ "failures": failures }))
    }
}

/// Enforces the retention an admin chose in Settings → Storage, daily or
/// weekly at the hour they chose, in UTC. Never runs while everything is
/// kept forever. Runs through the manual cleanup's [`CleanupJob`], so the
/// two never overlap.
pub struct StorageCleanupJob {
    cleanup: web::Data<CleanupJob>,
    store: Arc<dyn SourceMapStore>,
}

impl StorageCleanupJob {
    pub const KEY: &'static str = "storage_cleanup";

    pub fn new(cleanup: web::Data<CleanupJob>, store: Arc<dyn SourceMapStore>) -> Self {
        Self { cleanup, store }
    }

    /// Stored settings, with defaults for anything missing or unreadable.
    pub fn settings(stored: &Value) -> RetentionSettings {
        serde_json::from_value(stored.clone()).unwrap_or_default()
    }
}

#[async_trait]
impl ScheduledJob for StorageCleanupJob {
    fn key(&self) -> &'static str {
        Self::KEY
    }

    fn schedule(&self, settings: &Value) -> Option<(Schedule, Tz)> {
        let settings = Self::settings(settings);
        if !settings.deletes_anything() || settings.validate().is_err() {
            return None;
        }
        Some((settings.schedule(), Tz::UTC))
    }

    /// A missed cleanup runs once: catching up on every night it slept
    /// through would only repeat the same purge.
    fn misfire(&self) -> Misfire {
        Misfire::RunOnce
    }

    /// A cleanup asked for by hand is still running.
    fn busy(&self) -> bool {
        self.cleanup.status().state == CleanupState::Running
    }

    async fn run(&self, ctx: JobContext<'_>) -> AppResult<Value> {
        let settings = Self::settings(ctx.settings);
        let removed = self
            .cleanup
            .run_retention(ctx.pool.clone(), settings, Arc::clone(&self.store))
            .await?;
        Ok(serde_json::to_value(removed).unwrap_or_default())
    }
}
