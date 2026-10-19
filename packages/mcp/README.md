# @rustrak/mcp (deprecated)

**The Rustrak MCP server now ships inside the Rustrak server.** There is no
package to install and no process to run next to your assistant: your MCP
client connects to your Rustrak instance directly.

## Moving over

1. In the Rustrak dashboard, open **Settings → AI assistants (MCP)** and turn
   the MCP server on (instance admins only).
2. Create an API token in **Settings → API Tokens**.
3. Point your client at `https://<your-rustrak>/mcp`.

Claude Code:

```bash
claude mcp add --transport http rustrak https://<your-rustrak>/mcp \
  --header "Authorization: Bearer <API token>"
```

Cursor and other clients that read `mcpServers`:

```json
{
  "mcpServers": {
    "rustrak": {
      "type": "http",
      "url": "https://<your-rustrak>/mcp",
      "headers": { "Authorization": "Bearer <API token>" }
    }
  }
}
```

VS Code (`.vscode/mcp.json`), which asks for the token and keeps it encrypted,
so the file holds no secret:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "rustrak-token",
      "description": "Rustrak API token",
      "password": true
    }
  ],
  "servers": {
    "rustrak": {
      "type": "http",
      "url": "https://<your-rustrak>/mcp",
      "headers": { "Authorization": "Bearer ${input:rustrak-token}" }
    }
  }
}
```

Web assistants (claude.ai, ChatGPT) need no token: add a custom connector with
the URL and approve it in Rustrak. That needs `PUBLIC_URL` set on the server.

The tools are the same ones this package served, with the same names, and they
act with the permissions of the token's owner.

Full guide: [rustrak.dev/sdks/mcp](https://rustrak.dev/sdks/mcp)

## Still on an older server?

A Rustrak server older than the release that removed this package has no `/mcp`
endpoint. Keep using the last working version, pinned exactly so that it never
resolves to this one, configured as before:

```json
{
  "mcpServers": {
    "rustrak": {
      "command": "npx",
      "args": ["-y", "@rustrak/mcp@0.18.1"],
      "env": {
        "RUSTRAK_API_URL": "https://<your-rustrak>",
        "RUSTRAK_API_TOKEN": "<API token>"
      }
    }
  }
}
```
