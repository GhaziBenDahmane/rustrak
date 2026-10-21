-- User Feedback: a 'new_feedback' alert rule, and an index a digested event
-- uses to claim the feedback that arrived before it.

ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_alert_type_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_alert_type_check
    CHECK (alert_type IN ('new_issue', 'regression', 'unmute', 'new_feedback'));

CREATE INDEX idx_user_reports_event ON user_reports(project_id, event_id);
