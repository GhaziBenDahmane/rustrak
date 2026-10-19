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

Cursor, VS Code and other clients:

```json
{
  "mcpServers": {
    "rustrak": {
      "url": "https://<your-rustrak>/mcp",
      "headers": { "Authorization": "Bearer <API token>" }
    }
  }
}
```

The tools are the same ones this package served, with the same names, and they
act with the permissions of the token's owner.

Full guide: [rustrak.dev/sdks/mcp](https://rustrak.dev/sdks/mcp)

## Still on an older server?

A Rustrak server older than the release that removed this package has no `/mcp`
endpoint. Keep using the last working version until you upgrade:

```bash
npx -y @rustrak/mcp@0.18
```
