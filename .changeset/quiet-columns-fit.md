---
"@rustrak/server": patch
---

Stop PostgreSQL 500s on ingest. NUL characters are stripped from payloads, string fields are cut to their column length as Relay does, events, transactions, spans and breadcrumbs from before 1970 are dropped, out-of-range timestamps read as missing, and unknown `level` values fall back to the default. Spans are written with multi-row INSERTs, so a 1,000-span transaction takes 4 round trips instead of 1,000. Telemetry measures ingest latency from when the body has arrived and counts database errors by code.
