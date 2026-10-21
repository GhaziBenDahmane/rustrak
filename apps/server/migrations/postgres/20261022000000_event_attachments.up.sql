-- Files sent beside an event: for now, the screenshots a feedback widget
-- takes. Kept in the database, so deleting the event, its issue or its
-- project removes them with no file to clean up.
-- ponytail: rows hold the bytes; move to a file store if attachments of
-- error events are ever kept.
CREATE TABLE event_attachments (
    id UUID PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    size INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_event_attachments_event ON event_attachments(event_id);
