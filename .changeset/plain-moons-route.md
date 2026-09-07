---
"docs": "patch"
---

A Reverse proxy section in the production guide covers routing both containers with no published host ports, and documents the two addresses that setup depends on. The environment reference explains why `RUSTRAK_API_URL` stays internal and why `HOSTNAME` must never be forwarded into the container.
