/**
 * The configuration each client needs to reach `/mcp`, for the two ways in.
 *
 * Signing in (OAuth) needs nothing but the URL: the client finds the rest
 * from the server and asks the user to approve. A token goes in a header.
 */
export type ConnectMethod = 'oauth' | 'token';

export type SnippetClient = 'claudeCode' | 'json';

export interface Snippet {
  code: string;
  language: string;
}

/** The placeholder a reader replaces with their own API token. */
export const TOKEN_PLACEHOLDER = 'YOUR_TOKEN';

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

  const server =
    method === 'oauth'
      ? { url }
      : { url, headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` } };
  return {
    language: 'json',
    code: JSON.stringify({ mcpServers: { rustrak: server } }, null, 2),
  };
}
