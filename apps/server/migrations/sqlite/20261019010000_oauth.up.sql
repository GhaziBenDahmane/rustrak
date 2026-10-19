-- OAuth 2.1 for /mcp: Rustrak as the authorization server of its own MCP
-- endpoint. Only SHA-256 hashes of codes and tokens are stored.

-- Authorization codes: single use, minutes long, bound to the PKCE challenge.
CREATE TABLE oauth_codes (
    code_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    resource TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- One row per connected client: its current access and refresh token, both
-- replaced on every refresh. The refresh token they replaced is kept so that
-- its reuse, which means it was stolen, can end the connection.
CREATE TABLE oauth_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    resource TEXT NOT NULL,
    access_hash TEXT NOT NULL UNIQUE,
    access_expires_at TEXT NOT NULL,
    refresh_hash TEXT NOT NULL UNIQUE,
    refresh_expires_at TEXT NOT NULL,
    previous_refresh_hash TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_oauth_grants_user ON oauth_grants(user_id);
