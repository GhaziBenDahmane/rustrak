---
"@rustrak/server": minor
---

User Feedback: Rustrak ingests Sentry `feedback` and legacy `user_report` envelope items, and the legacy `user-feedback` endpoint, as feedback issues with their screenshots. They show up in a new User Feedback page with an inbox, resolved and spam view, and in the event page. A `new_feedback` alert type, feedback endpoints in the API and the generated client, and MCP tools to list feedback and fetch screenshots as images come with them. Bumps `rustls-webpki` for RUSTSEC-2026-0381, -0382 and -0383.
