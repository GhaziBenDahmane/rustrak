use actix_web::{
    body::MessageBody,
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error,
};
use std::future::{ready, Future, Ready};
use std::pin::Pin;
use std::time::Instant;

use crate::telemetry::{Counters, Rejection};

/// Counts what the server answered, for the anonymous telemetry. Ingest
/// requests are bucketed by outcome with their latency; every route counts
/// its 5xx under its pattern (`/api/issues/{id}`), never under the path.
#[derive(Clone, Copy)]
pub struct TelemetryMiddleware {
    counters: &'static Counters,
}

impl TelemetryMiddleware {
    pub fn new(counters: &'static Counters) -> Self {
        Self { counters }
    }
}

impl<S, B> Transform<S, ServiceRequest> for TelemetryMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = TelemetryService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(TelemetryService {
            service,
            counters: self.counters,
        }))
    }
}

pub struct TelemetryService<S> {
    service: S,
    counters: &'static Counters,
}

impl<S, B> Service<ServiceRequest> for TelemetryService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let started = Instant::now();
        let counters = self.counters;
        let fut = self.service.call(req);
        Box::pin(async move {
            let res = fut.await?;
            let pattern = res.request().match_pattern();
            let status = res.status().as_u16();
            record(counters, pattern.as_deref(), status, started);
            Ok(res)
        })
    }
}

fn is_ingest(pattern: &str) -> bool {
    pattern.starts_with("/api/{project_id}/envelope/")
        || pattern.starts_with("/api/{project_id}/store/")
}

fn record(counters: &Counters, pattern: Option<&str>, status: u16, started: Instant) {
    let Some(pattern) = pattern else {
        return;
    };
    if status >= 500 {
        counters.http_5xx(pattern);
        return;
    }
    if !is_ingest(pattern) {
        return;
    }
    match status {
        200..=299 => counters.ingest_accepted(started.elapsed()),
        429 => counters.ingest_rejected(Rejection::RateLimit),
        401 | 403 => counters.ingest_rejected(Rejection::Auth),
        413 => counters.ingest_rejected(Rejection::TooLarge),
        400 => counters.ingest_rejected(Rejection::Malformed),
        _ => counters.ingest_rejected(Rejection::Other),
    }
}
