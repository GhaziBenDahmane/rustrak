import { describe, expect, it } from 'vitest';
import { mcpSnippet, TOKEN_PLACEHOLDER } from './snippets';

const URL = 'https://rustrak.example/mcp';

describe('mcpSnippet', () => {
  it('gives a signing-in client the URL and no credential', () => {
    for (const client of ['claudeCode', 'json', 'vscode'] as const) {
      const { code } = mcpSnippet('oauth', client, URL);
      expect(code).toContain(URL);
      expect(code).not.toContain(TOKEN_PLACEHOLDER);
      expect(code).not.toContain('Authorization');
    }
  });

  it('gives a token client the bearer header', () => {
    for (const client of ['claudeCode', 'json', 'vscode'] as const) {
      const { code } = mcpSnippet('token', client, URL);
      expect(code).toContain(URL);
      expect(code).toContain(`Bearer ${TOKEN_PLACEHOLDER}`);
    }
  });

  it('writes JSON a client can parse', () => {
    const { code } = mcpSnippet('token', 'json', URL);
    expect(JSON.parse(code).mcpServers.rustrak.url).toBe(URL);
  });
});

describe('remote server entries', () => {
  it('declare their transport, which Claude Code reads a URL without as stdio', () => {
    const { code } = mcpSnippet('oauth', 'json', URL);
    expect(JSON.parse(code).mcpServers.rustrak.type).toBe('http');
  });

  it("use VS Code's own `servers` shape for VS Code", () => {
    const { code } = mcpSnippet('token', 'vscode', URL);
    const server = JSON.parse(code).servers.rustrak;
    expect(server).toMatchObject({ type: 'http', url: URL });
    expect(server.headers.Authorization).toBe(`Bearer ${TOKEN_PLACEHOLDER}`);
  });
});
