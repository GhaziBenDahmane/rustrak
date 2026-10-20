-- Numeric issue id, unique across projects: the id the Sentry-compatible API
-- exposes (GitLab's error tracking only accepts digits). SQLite has no
-- sequence for a non-key column: a one-row counter hands out the next id,
-- and never goes back when an issue is deleted, so an id is never reused.
ALTER TABLE issues ADD COLUMN numeric_id INTEGER;
UPDATE issues SET numeric_id = rowid;
CREATE UNIQUE INDEX idx_issues_numeric_id ON issues(numeric_id);

CREATE TABLE issue_numeric_id_counter (value INTEGER NOT NULL);
INSERT INTO issue_numeric_id_counter SELECT COALESCE(MAX(numeric_id), 0) FROM issues;

-- An INSERT reads `value + 1` (NEXT_NUMERIC_ID); this advances the counter
-- in the same statement. One that leaves numeric_id out gets the next id
-- here, as an identity column would on Postgres.
CREATE TRIGGER issues_numeric_id_counter AFTER INSERT ON issues
BEGIN
    UPDATE issue_numeric_id_counter SET value = COALESCE(NEW.numeric_id, value + 1);
    UPDATE issues SET numeric_id = (SELECT value FROM issue_numeric_id_counter)
    WHERE rowid = NEW.rowid AND numeric_id IS NULL;
END;
