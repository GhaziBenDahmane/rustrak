---
"@rustrak/server": patch
---

The access log now shows the client's address behind a reverse proxy instead of the proxy's. Each line reads `Forwarded` / `X-Forwarded-For` and falls back to the peer address when neither is present, the same address ingest already stores on events.
