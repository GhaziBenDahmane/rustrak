---
"@rustrak/server": patch
---

Source maps uploaded by the Sentry SDK v11 bundler plugins now work. The chunk-upload capability advertises `compression`, which the `sentry` npm uploader requires before it sends any chunk (@chrisedington). Index (sectioned) source maps, which that uploader sends unflattened and Next.js with Turbopack writes for nearly every chunk, now resolve inside the section that holds the frame, including maps already stored (@chrisedington). Re-uploading a source map for the same debug_id replaces the previous one, as in Sentry. Dependencies updated, including rustls 0.23.46 for RUSTSEC-2026-0346 through RUSTSEC-2026-0349.
