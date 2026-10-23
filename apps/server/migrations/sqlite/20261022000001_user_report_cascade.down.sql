CREATE TABLE user_reports_old (
    id TEXT PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
    event_id TEXT,
    name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    comments TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO user_reports_old (id, project_id, issue_id, event_id, name, email, comments, created_at)
SELECT id, project_id, issue_id, event_id, name, email, comments, created_at FROM user_reports;

DROP TABLE user_reports;
ALTER TABLE user_reports_old RENAME TO user_reports;

CREATE INDEX idx_user_reports_issue ON user_reports(issue_id, created_at DESC);
CREATE INDEX idx_user_reports_project ON user_reports(project_id, created_at DESC);
CREATE INDEX idx_user_reports_event ON user_reports(project_id, event_id);
