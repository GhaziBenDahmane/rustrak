---
"@rustrak/server": patch
---

Projects whose key is not an RFC 4122 UUID load again. The API spec typed `sentry_key` as a UUID, so `@rustrak/client`, and with it the dashboard, rejected keys carried over from Sentry, which are random hex: the projects page failed with "Could not load projects". The key is now a plain string in the spec and the client, as event ids already are.
