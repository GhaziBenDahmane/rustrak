-- A user report goes with the issues it belongs to: the error it is about
-- (`issue_id`, was SET NULL, which left reports no page shows and nothing
-- cleans) and, for one a feedback wrote, that feedback (`feedback_issue_id`).
-- SQLite cannot alter a foreign key, so the table is rebuilt; nothing
-- references it, so dropping it cascades over nothing.

CREATE TABLE user_reports_new (
    id TEXT PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
    feedback_issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
    event_id TEXT,
    name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    comments TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO user_reports_new (id, project_id, issue_id, event_id, name, email, comments, created_at)
SELECT id, project_id, issue_id, event_id, name, email, comments, created_at FROM user_reports;

DROP TABLE user_reports;
ALTER TABLE user_reports_new RENAME TO user_reports;

CREATE INDEX idx_user_reports_issue ON user_reports(issue_id, created_at DESC);
CREATE INDEX idx_user_reports_project ON user_reports(project_id, created_at DESC);
CREATE INDEX idx_user_reports_event ON user_reports(project_id, event_id);
CREATE INDEX idx_user_reports_feedback ON user_reports(feedback_issue_id);
