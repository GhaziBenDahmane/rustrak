---
"@rustrak/server": "patch"
---

Serve the subset of Sentry's API that GitLab's Error Tracking reads, so a GitLab project can list, open, resolve, ignore and reopen Rustrak issues and jump back to the dashboard. Issues now carry a numeric id, unique across projects, next to the existing UUID, and a deleted issue's id is never reused. `@rustrak/mcp` is no longer published; its replacement, MCP served by the server at `/mcp`, has shipped since 0.19.0.
