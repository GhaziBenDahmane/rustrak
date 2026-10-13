-- GitHub integration. One GitHub App per instance (created through the
-- manifest flow), its installations, the repository each project points at,
-- the GitHub issues linked to Rustrak issues, and the commits seen on push.
CREATE TABLE github_app (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    app_id INTEGER NOT NULL,
    slug TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    private_key TEXT NOT NULL,
    html_url TEXT NOT NULL,
    owner_login TEXT NOT NULL DEFAULT '',
    web_url TEXT NOT NULL,
    api_url TEXT NOT NULL,
    last_webhook_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE github_installations (
    id INTEGER PRIMARY KEY,
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'User',
    suspended BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE project_repositories (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    installation_id INTEGER NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,
    default_branch TEXT NOT NULL DEFAULT 'main',
    code_mappings TEXT NOT NULL DEFAULT '[]',
    -- Open a GitHub issue for new issues that pass these filters (JSON).
    auto_create_issues BOOLEAN NOT NULL DEFAULT 0,
    auto_create_conditions TEXT NOT NULL DEFAULT '{}',
    codeowners TEXT,
    codeowners_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_project_repositories_repo ON project_repositories(repo_full_name);

CREATE TABLE issue_external_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (issue_id, repo_full_name, number)
);
CREATE INDEX idx_issue_external_links_remote ON issue_external_links(repo_full_name, number);

CREATE TABLE repo_commits (
    repo_full_name TEXT NOT NULL,
    sha TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    author_name TEXT NOT NULL DEFAULT '',
    author_login TEXT,
    url TEXT NOT NULL DEFAULT '',
    files TEXT NOT NULL DEFAULT '[]',
    committed_at TEXT NOT NULL,
    PRIMARY KEY (repo_full_name, sha)
);
CREATE INDEX idx_repo_commits_time ON repo_commits(repo_full_name, committed_at DESC);

-- Lets GitHub assignees and Rustrak users find each other.
ALTER TABLE users ADD COLUMN github_login TEXT;
