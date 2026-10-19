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
-- replaced on every refresh.
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_oauth_grants_user ON oauth_grants(user_id);

-- Every refresh token a grant has spent, kept as long as the grant: one coming
-- back means it was stolen, and ends the connection (RFC 9700 4.14.2).
CREATE TABLE oauth_spent_refresh_tokens (
    refresh_hash TEXT PRIMARY KEY,
    grant_id INTEGER NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE
);

CREATE INDEX idx_oauth_spent_refresh_tokens_grant ON oauth_spent_refresh_tokens(grant_id);
