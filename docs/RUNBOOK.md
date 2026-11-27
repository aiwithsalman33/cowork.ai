# CoWork AI — Runbook

Operational procedures for the production stack (`docker-compose.prod.yml` on the Dokploy VPS).
Commands below run on the VPS in the compose project directory (Dokploy → the app → **Open terminal**, or SSH).
Replace `dc` with `docker compose -f docker-compose.prod.yml` (Dokploy adds `-p <project>`; use the same project name).

## Backups & restore

### What is backed up
| What | Where in the bucket | How |
|---|---|---|
| PostgreSQL database (all tenant data, payments, settings) | `db/coworkai-YYYYMMDD-HHMM.dump.gz` | `pg_dump -Fc`, gzipped |
| WhatsApp QR sessions (`wa_sessions` volume) | `wa-sessions/coworkai-YYYYMMDD-HHMM.tar.gz.age` | tar + gzip, **encrypted with age** |

- Runs every night at **02:30 IST** from the `backup` service (`docker/backup/backup.sh`).
- Keeps `BACKUP_RETENTION_DAYS` days (default 14) and deletes older objects.
- Pings `BACKUP_HEARTBEAT_URL` after each successful run, so an uptime monitor can alert when a night is missed.
- If the `BACKUP_S3_*` settings are missing, the service logs a warning and does nothing; it never stops the app.
- WhatsApp sessions are skipped (with a warning) when `BACKUP_AGE_RECIPIENT` is empty. They are never uploaded unencrypted.

### Settings (Dokploy → Environment)
| Variable | Example | Notes |
|---|---|---|
| `BACKUP_S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | Any S3-compatible store (R2, B2, S3, Wasabi) |
| `BACKUP_S3_BUCKET` | `coworkai-backups` | Create it first |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | | Key limited to this bucket |
| `BACKUP_S3_REGION` | `auto` | R2: `auto`; AWS: e.g. `ap-south-1` |
| `BACKUP_S3_PROVIDER` | `Cloudflare` | rclone provider name; `Other` works for most |
| `BACKUP_AGE_RECIPIENT` | `age1…` | Public key; keep the private key **offline** |
| `BACKUP_RETENTION_DAYS` | `14` | |
| `BACKUP_HEARTBEAT_URL` | `https://hc-ping.com/<uuid>` | Optional |
| `BACKUP_ON_START` | `false` | `true` = one backup each time the service starts |

Use a storage account that is **separate from the VPS provider**, so losing the VPS account does not also lose the backups.

Create the age key pair once on your own computer: `age-keygen -o coworkai-backup.key`. The `age1…` line it prints is `BACKUP_AGE_RECIPIENT`. Store `coworkai-backup.key` in a password manager or offline. Without it the WhatsApp session backups cannot be opened.

### Run a backup now
```bash
dc exec backup /bin/sh /backup/backup.sh --now
dc logs --tail 50 backup        # check the result
```

### Restore
```bash
dc exec backup /bin/sh /backup/restore.sh --list                          # available dumps
dc exec backup /bin/sh /backup/restore.sh db/coworkai-20261128-2100.dump.gz  # into a NEW scratch DB
```
The scratch restore prints row counts for `User`, `Message` and `Payment`. Check them, then drop the scratch database (the script prints the command).

**Replacing the live database** (real disaster only):
1. Stop the app so nothing writes: `dc stop app`.
2. `dc exec backup /bin/sh /backup/restore.sh db/<dump> --into-live` and type the database name to confirm.
3. `dc start app`, then check `/health/ready` and sign in.

**WhatsApp sessions** (only if the volume is lost):
```bash
age -d -i coworkai-backup.key coworkai-YYYYMMDD-HHMM.tar.gz.age | tar -xzf - -C <restore-dir>
```
Copy the files into the `wa_sessions` volume with the app stopped. Sessions older than a few days may need a new QR scan anyway.

### Restore-test log
Do a scratch restore at least once a month and after any change to the backup setup.

| Date | Dump | Duration | Result | By |
|---|---|---|---|---|
| 2026-11-28 | local test dump (development stack, S3 stand-in) | 1 s | OK: scratch DB created, row counts printed, WhatsApp archive decrypted with the key | Claude Code (Phase 1) |
| | | | | |
