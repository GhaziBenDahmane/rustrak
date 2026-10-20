-- Numeric issue id, unique across projects: the id the Sentry-compatible API
-- exposes (GitLab's error tracking only accepts digits). SQLite has no
-- sequence for a non-key column, so new rows take MAX + 1 at insert time.
ALTER TABLE issues ADD COLUMN numeric_id INTEGER;
UPDATE issues SET numeric_id = rowid;
CREATE UNIQUE INDEX idx_issues_numeric_id ON issues(numeric_id);
