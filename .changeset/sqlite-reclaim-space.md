---
"@rustrak/server": patch
---

On SQLite, a storage cleanup now gives the space it freed back to the disk. New databases are created with `auto_vacuum = INCREMENTAL`, and after a cleanup or retention run the freed pages are released a few megabytes at a time, so the file shrinks instead of only stopping its growth. A database created before keeps SQLite's default until a one-off `VACUUM`, described in the database docs.
