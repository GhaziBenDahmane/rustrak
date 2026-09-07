---
"@rustrak/server": "patch"
---

The dashboard image pins its bind address to `0.0.0.0`, so a reverse proxy on the same Docker network reaches the container on port 3000 with nothing published to the host (@andeerc). The Compose files never forward `HOSTNAME` or `HOST` from the ambient environment, which used to hand the dashboard a container id it could not bind to, and their port mappings carry defaults so the files run without an `.env`.

Timestamps on transaction-embedded spans are parsed the way Relay parses them, whether the SDK sends epoch seconds or an RFC3339 string (@alydharshi). A string with no offset is read as UTC instead of the reader's local time, sub-millisecond precision survives so short spans no longer render with a negative duration, and impossible values such as hour 24 or February 30th are rejected rather than rolled forward a day.
