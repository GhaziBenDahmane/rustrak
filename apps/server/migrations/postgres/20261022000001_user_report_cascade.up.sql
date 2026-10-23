-- A user report goes with the issues it belongs to: the error it is about
-- (`issue_id`, was SET NULL, which left reports no page shows and nothing
-- cleans) and, for one a feedback wrote, that feedback (`feedback_issue_id`).

ALTER TABLE user_reports DROP CONSTRAINT IF EXISTS user_reports_issue_id_fkey;
ALTER TABLE user_reports ADD CONSTRAINT user_reports_issue_id_fkey
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;

ALTER TABLE user_reports
    ADD COLUMN feedback_issue_id UUID REFERENCES issues(id) ON DELETE CASCADE;
CREATE INDEX idx_user_reports_feedback ON user_reports(feedback_issue_id);
