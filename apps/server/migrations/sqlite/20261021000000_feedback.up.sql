-- User Feedback (SQLite).
--
-- 1. `alert_rules.alert_type` gains 'new_feedback'. SQLite cannot alter a
--    CHECK in place, so the table is rebuilt the way
--    20260831000000_custom_webhook_provider rebuilt alert_integrations: the
--    child references (alert_rule_channels CASCADE, alert_history SET NULL)
--    are parked first so the DROP cascades over nothing, then restored, all
--    inside the migration's transaction.
-- 2. user_reports gets an index on (project_id, event_id): a digested event
--    claims the feedback that arrived before it by that pair.

CREATE TABLE alert_rules_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('new_issue', 'regression', 'unmute', 'new_feedback')),
    is_enabled INTEGER NOT NULL DEFAULT 1,
    conditions TEXT NOT NULL DEFAULT '{}',
    cooldown_minutes INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, alert_type)
);

INSERT INTO alert_rules_new (
    id, project_id, name, alert_type, is_enabled, conditions,
    cooldown_minutes, last_triggered_at, created_at, updated_at
)
SELECT
    id, project_id, name, alert_type, is_enabled, conditions,
    cooldown_minutes, last_triggered_at, created_at, updated_at
FROM alert_rules;

CREATE TABLE arc_rule_references_backup AS
    SELECT alert_rule_id, integration_id, routing_override FROM alert_rule_channels;
CREATE TABLE ah_rule_references_backup AS
    SELECT id, alert_rule_id FROM alert_history WHERE alert_rule_id IS NOT NULL;

DELETE FROM alert_rule_channels;
UPDATE alert_history SET alert_rule_id = NULL;

DROP TABLE alert_rules;
ALTER TABLE alert_rules_new RENAME TO alert_rules;

CREATE INDEX idx_alert_rules_project ON alert_rules(project_id);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(project_id, is_enabled) WHERE is_enabled;

INSERT INTO alert_rule_channels (alert_rule_id, integration_id, routing_override)
    SELECT alert_rule_id, integration_id, routing_override FROM arc_rule_references_backup;
UPDATE alert_history
SET alert_rule_id = (
    SELECT b.alert_rule_id FROM ah_rule_references_backup b WHERE b.id = alert_history.id
)
WHERE id IN (SELECT id FROM ah_rule_references_backup);

DROP TABLE arc_rule_references_backup;
DROP TABLE ah_rule_references_backup;

CREATE INDEX idx_user_reports_event ON user_reports(project_id, event_id);
