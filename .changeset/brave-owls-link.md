---
"@rustrak/server": minor
---

GitHub integration. Rustrak creates its own private GitHub App for your server, then each project picks a repository. Stack frames link to their line on GitHub, issues create or link GitHub issues and keep status, comments and assignees in sync both ways, `Fixes WEB-12` in a commit resolves the issue, issues list suspect commits and their CODEOWNERS, and new errors can open GitHub issues automatically. Alert rules gain filters by level, environment and minimum events, and a New Issue rule fires once per issue. The access log shows the client's address behind a reverse proxy instead of the proxy's (@janatjak).
