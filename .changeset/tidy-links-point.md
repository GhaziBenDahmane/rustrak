---
"@rustrak/server": patch
---

Issue links in alert notifications point at the server by default. Without `DASHBOARD_URL` they used `http://localhost:3000`, the address of a dashboard container 0.15 no longer needs, so a fresh install sent links nobody could open. The server now takes `DASHBOARD_URL` if set, then `PUBLIC_URL`, then its bind address, resolved once at startup and normalised the way `PUBLIC_URL` is. `DASHBOARD_URL` is only needed for a dashboard served from another host.

Sign-in treats the email address case-insensitively (@edideaur). New accounts and invitations store it trimmed and lowercased, and an account created before this change with capitals in its address still signs in with any casing.
