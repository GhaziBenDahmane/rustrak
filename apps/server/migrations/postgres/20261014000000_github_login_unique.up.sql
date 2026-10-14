-- One Rustrak user per GitHub login: inbound assignments look people up by it.
CREATE UNIQUE INDEX idx_users_github_login ON users (LOWER(github_login));
