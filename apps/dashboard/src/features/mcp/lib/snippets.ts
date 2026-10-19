/**
 * The configuration each client needs to reach `/mcp`, for the two ways in.
 *
 * Signing in (OAuth) needs nothing but the URL: the client finds the rest
 * from the server and asks the user to approve. A token goes in a header.
 */
export type ConnectMethod = 'oauth' | 'token';

export type SnippetClient = 'claudeCode' | 'json' | 'vscode';

export interface Snippet {
  code: string;
  language: string;
}

/** The placeholder a reader replaces with their own API token. */
export const TOKEN_PLACEHOLDER = 'YOUR_TOKEN';

/** VS Code's reference to the token it asks for: its syntax, not a template. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code input syntax, kept literal
export const VSCODE_TOKEN_INPUT = '${input:rustrak-token}';

export function mcpSnippet(
  method: ConnectMethod,
  client: SnippetClient,
  url: string,
): Snippet {
  const header = `Authorization: Bearer ${TOKEN_PLACEHOLDER}`;

  if (client === 'claudeCode') {
    return {
      language: 'bash',
      code:
        method === 'oauth'
          ? `claude mcp add --transport http rustrak ${url}`
          : `claude mcp add --transport http rustrak ${url} \\\n  --header "${header}"`,
    };
  }

  if (client === 'vscode') {
    // VS Code asks for the token once and keeps it encrypted, so
    // `.vscode/mcp.json` holds no secret and can be committed.
    const server = { type: 'http', url };
    const config =
      method === 'oauth'
        ? { servers: { rustrak: server } }
        : {
            inputs: [
              {
                type: 'promptString',
                id: 'rustrak-token',
                description: 'Rustrak API token',
                password: true,
              },
            ],
            servers: {
              rustrak: {
                ...server,
                headers: { Authorization: `Bearer ${VSCODE_TOKEN_INPUT}` },
              },
            },
          };
    return { language: 'json', code: JSON.stringify(config, null, 2) };
  }

  // `type` because a client that reads a URL without it (Claude Code's
  // `.mcp.json`) takes the entry for a local stdio server.
  const server =
    method === 'oauth'
      ? { type: 'http', url }
      : {
          type: 'http',
          url,
          headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
        };
  const config = { mcpServers: { rustrak: server } };
  return { language: 'json', code: JSON.stringify(config, null, 2) };
}
