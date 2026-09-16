-- Anonymous telemetry: the random id one installation reports under.
-- Generated on first use, never derived from anything about the host.
ALTER TABLE installation ADD COLUMN telemetry_id TEXT;
