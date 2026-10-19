-- OAuth 2.1 for /mcp: Rustrak as the authorization server of its own MCP
-- endpoint. Only SHA-256 hashes of codes and tokens are stored.

-- Authorization codes: single use, minutes long, bound to the PKCE challenge.
CREATE TABLE oauth_codes (
    code_hash CHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id VARCHAR(2048) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    redirect_uri VARCHAR(2048) NOT NULL,
    resource VARCHAR(2048) NOT NULL,
    code_challenge VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- One row per connected client: its current access and refresh token, both
-- replaced on every refresh.
CREATE TABLE oauth_grants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id VARCHAR(2048) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    resource VARCHAR(2048) NOT NULL,
    access_hash CHAR(64) NOT NULL UNIQUE,
    access_expires_at TIMESTAMPTZ NOT NULL,
    refresh_hash CHAR(64) NOT NULL UNIQUE,
    refresh_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oauth_grants_user ON oauth_grants(user_id);
