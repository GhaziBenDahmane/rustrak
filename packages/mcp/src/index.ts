// The MCP server moved into the Rustrak server. This release only says so:
// an assistant configured with `npx -y @rustrak/mcp` gets the way forward in
// its server log instead of a server that silently stops matching the API.
console.error(`[rustrak-mcp] @rustrak/mcp is deprecated.

The MCP server is now built into Rustrak itself, so there is nothing to install:
  1. In the dashboard, open Settings > AI assistants (MCP) and turn it on.
  2. Point your MCP client at https://<your-rustrak>/mcp with the header
     "Authorization: Bearer <API token>".

Guide: https://rustrak.dev/sdks/mcp
Running a server older than this release? Pin the previous package: npx -y @rustrak/mcp@0.18`);
process.exit(1);
