-- Whether /mcp answers. Off until an instance admin turns it on.
ALTER TABLE installation ADD COLUMN mcp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
