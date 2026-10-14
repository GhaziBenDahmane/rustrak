---
"@rustrak/server": patch
---

Advertise `"compression": []` in the chunk-upload capability response, so Sentry SDK v11 bundler plugins (which upload through the `sentry` npm package) can upload source maps.
