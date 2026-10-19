---
"@rustrak/server": minor
---

The MCP server now ships inside Rustrak at `/mcp`, off until an instance admin turns it on in Settings → AI assistants (MCP). Assistants connect with an API token, or sign in through OAuth 2.1 with PKCE, which lets web assistants such as claude.ai and ChatGPT connect without a token. `@rustrak/mcp` is deprecated in favour of it. `@rustrak/client` is now generated from `openapi.json`: every method takes one `{ path, query, body }` object and several methods and types are renamed (breaking). Logs and spans accept RFC 3339 timestamps, so sentry-go logs are no longer dropped. Dashboard time charts no longer clip their first and last bars, and model ids stay on one line (@rookbreezy).
