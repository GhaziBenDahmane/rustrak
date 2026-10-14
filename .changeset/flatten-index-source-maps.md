---
"@rustrak/server": patch
---

Resolve frames against index (sectioned) source maps by flattening them when parsed. Turbopack writes these for nearly every chunk, so Next.js stack traces stayed minified. Already-stored index maps start resolving without a re-upload.
