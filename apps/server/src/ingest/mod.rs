pub mod decompression;
pub mod envelope;
pub mod parser;
pub mod storage;

pub use decompression::{decompress_body, get_content_encoding, MAX_COMPRESSED_SIZE};
pub use envelope::{EnvelopeItemKind, EventMetadata};

/// The largest attachment kept. A larger one is dropped on its own and its
/// event kept. ponytail: attachments live in the database (feedback
/// screenshots only), so this also bounds a row; move them to a file store
/// before raising it much or keeping error attachments.
pub const MAX_ATTACHMENT_SIZE: usize = 10 * 1024 * 1024;
pub(crate) use parser::detach_payload_if_needed;
pub use parser::EnvelopeParser;
pub use storage::{
    delete_event, delete_event_for_project, get_event_path, get_ingest_dir,
    list_pending_event_metadata, prepare_ingest_dir, read_event, read_event_for_project,
    store_event, store_event_with_metadata,
};
