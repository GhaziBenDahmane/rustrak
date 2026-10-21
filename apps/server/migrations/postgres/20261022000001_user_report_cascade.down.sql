DROP INDEX IF EXISTS idx_user_reports_feedback;
ALTER TABLE user_reports DROP COLUMN IF EXISTS feedback_issue_id;

ALTER TABLE user_reports DROP CONSTRAINT IF EXISTS user_reports_issue_id_fkey;
ALTER TABLE user_reports ADD CONSTRAINT user_reports_issue_id_fkey
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE SET NULL;
