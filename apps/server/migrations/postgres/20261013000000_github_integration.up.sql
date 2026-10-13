-- GitHub integration. One GitHub App per instance (created through the
-- manifest flow), its installations, the repository each project points at,
-- the GitHub issues linked to Rustrak issues, and the commits seen on push.
CREATE TABLE github_app (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    app_id BIGINT NOT NULL,
    slug TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    webhook_secret TEXT NOT NULL,
    private_key TEXT NOT NULL,
    html_url TEXT NOT NULL,
    owner_login TEXT NOT NULL DEFAULT '',
    web_url TEXT NOT NULL,
    api_url TEXT NOT NULL,
    last_webhook_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE github_installations (
    id BIGINT PRIMARY KEY,
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'User',
    suspended BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_repositories (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    installation_id BIGINT NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,
    default_branch TEXT NOT NULL DEFAULT 'main',
    code_mappings TEXT NOT NULL DEFAULT '[]',
    -- Open a GitHub issue for new issues that pass these filters (JSON).
    auto_create_issues BOOLEAN NOT NULL DEFAULT FALSE,
    auto_create_conditions TEXT NOT NULL DEFAULT '{}',
    codeowners TEXT,
    codeowners_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_project_repositories_repo ON project_repositories(repo_full_name);

CREATE TABLE issue_external_links (
    id SERIAL PRIMARY KEY,
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,
    number BIGINT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    committed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (repo_full_name, sha)
);
CREATE INDEX idx_repo_commits_time ON repo_commits(repo_full_name, committed_at DESC);

-- Lets GitHub assignees and Rustrak users find each other.
ALTER TABLE users ADD COLUMN github_login TEXT;
