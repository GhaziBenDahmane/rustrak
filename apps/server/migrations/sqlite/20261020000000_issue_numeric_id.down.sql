DROP TRIGGER issues_numeric_id_counter;
DROP TABLE issue_numeric_id_counter;
DROP INDEX idx_issues_numeric_id;
ALTER TABLE issues DROP COLUMN numeric_id;
