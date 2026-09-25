---
"@rustrak/server": patch
---

Issue links in alert notifications point at the server by default. Without `DASHBOARD_URL` they used `http://localhost:3000`, the address of a dashboard container 0.15 no longer needs, so a fresh install sent links nobody could open. The server now takes `DASHBOARD_URL` if set, then `PUBLIC_URL`, then its bind address, resolved once at startup and normalised the way `PUBLIC_URL` is. `DASHBOARD_URL` is only needed for a dashboard served from another host.

Sign-in treats the email address case-insensitively (@edideaur). New accounts and invitations store it trimmed and lowercased, and an account created before this change with capitals in its address still signs in with any casing.

The server image declares a single volume, `/data`. It used to declare `/data/sourcemaps` as a second one, so `docker run -v rustrak_data:/data` kept uploaded source maps in an unnamed volume that a container created from a new image did not see. Source maps now live in `rustrak_data` by default, and a volume mounted at `/data/sourcemaps` or `SOURCEMAP_STORAGE_PATH` works as before. Accepting an invitation for an address that already has an account, in any casing, is refused instead of creating a second account.
