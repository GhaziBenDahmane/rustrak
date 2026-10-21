DROP INDEX IF EXISTS idx_user_reports_event;

DELETE FROM alert_rules WHERE alert_type = 'new_feedback';
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_alert_type_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_alert_type_check
    CHECK (alert_type IN ('new_issue', 'regression', 'unmute'));
