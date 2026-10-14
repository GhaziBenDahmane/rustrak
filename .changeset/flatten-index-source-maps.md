---
"@rustrak/server": patch
---

Resolve frames through index (sectioned) source maps, looking each frame up inside the section that contains it. Turbopack writes these for nearly every chunk, so Next.js stack traces stayed minified. Already-stored index maps start resolving without a re-upload.
