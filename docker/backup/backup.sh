#!/bin/sh
# CoWork AI — nightly off-site backups (audit C3).
#
#   backup.sh          run as the container command: waits for 02:30 IST every night
#   backup.sh --now    one backup right now, then exit (exit code 1 on failure)
#
# What it uploads to the S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS S3, MinIO…):
#   db/coworkai-YYYYMMDD-HHMM.dump.gz            pg_dump -Fc of the database, gzipped
#   wa-sessions/coworkai-YYYYMMDD-HHMM.tar.gz.age WhatsApp QR sessions, encrypted with age
# Objects older than BACKUP_RETENTION_DAYS are deleted. Missing settings = warn and idle.
set -u

log() { echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

need_tools() {
  command -v rclone >/dev/null 2>&1 && command -v age >/dev/null 2>&1 && return 0
  log "installing rclone and age"
  apk add --no-cache rclone age >/dev/null 2>&1 || { log "ERROR: could not install rclone/age"; return 1; }
}

configured() {
  for v in BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
    eval "val=\${$v:-}"
    [ -n "$val" ] || { log "WARNING: $v is not set — backups are OFF"; return 1; }
  done
}

# rclone needs no config file (the remote comes from env); an empty one keeps it quiet
export RCLONE_CONFIG="${TMPDIR:-/tmp}/rclone.conf"
: > "$RCLONE_CONFIG"
export RCLONE_CONFIG_STORE_TYPE=s3
export RCLONE_CONFIG_STORE_PROVIDER="${BACKUP_S3_PROVIDER:-Other}"
export RCLONE_CONFIG_STORE_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
export RCLONE_CONFIG_STORE_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-}"
export RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-}"
export RCLONE_CONFIG_STORE_REGION="${BACKUP_S3_REGION:-auto}"
export RCLONE_CONFIG_STORE_NO_CHECK_BUCKET=true
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
DEST="store:${BACKUP_S3_BUCKET:-}"

run_backup() {
  stamp=$(date -u '+%Y%m%d-%H%M')
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT INT TERM
  log "starting backup $stamp"

  db_file="$work/coworkai-$stamp.dump.gz"
  if ! pg_dump -h "${PGHOST:-db}" -U "${POSTGRES_USER:-cowork}" -d "${POSTGRES_DB:-cowork}" -Fc | gzip -6 > "$db_file"; then
    log "ERROR: pg_dump failed"; return 1
  fi
  [ -s "$db_file" ] || { log "ERROR: database dump is empty"; return 1; }
  rclone copyto "$db_file" "$DEST/db/coworkai-$stamp.dump.gz" || { log "ERROR: database upload failed"; return 1; }
  log "database uploaded ($(du -h "$db_file" | cut -f1))"

  if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
    wa_file="$work/coworkai-$stamp.tar.gz.age"
    if tar -C /data/wa-sessions -czf - . | age -r "$BACKUP_AGE_RECIPIENT" > "$wa_file" && [ -s "$wa_file" ]; then
      rclone copyto "$wa_file" "$DEST/wa-sessions/coworkai-$stamp.tar.gz.age" || { log "ERROR: WhatsApp sessions upload failed"; return 1; }
      log "WhatsApp sessions uploaded (encrypted)"
    else
      log "ERROR: could not archive/encrypt WhatsApp sessions"; return 1
    fi
  else
    log "WARNING: BACKUP_AGE_RECIPIENT not set — WhatsApp sessions skipped (never uploaded unencrypted)"
  fi

  days="${BACKUP_RETENTION_DAYS:-14}"
  rclone delete --min-age "${days}d" "$DEST/db" 2>/dev/null
  rclone delete --min-age "${days}d" "$DEST/wa-sessions" 2>/dev/null
  log "removed backups older than $days days"

  if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
    wget -q -O /dev/null -T 15 "$BACKUP_HEARTBEAT_URL" || log "WARNING: heartbeat ping failed"
  fi
  log "backup $stamp finished OK"
}

if [ "${1:-}" = "--now" ]; then
  configured || exit 1
  need_tools || exit 1
  run_backup
  exit $?
fi

# ---- long-running scheduler ----
if ! configured; then
  log "set the BACKUP_S3_* variables in Dokploy to turn backups on; idling"
  exec sleep infinity
fi
need_tools || { log "idling"; exec sleep infinity; }

if [ "${BACKUP_ON_START:-false}" = "true" ]; then
  run_backup || log "ERROR: start-up backup failed"
fi

# 02:30 IST = 21:00 UTC
last=""
while true; do
  now=$(date -u '+%H%M'); today=$(date -u '+%Y%m%d')
  if [ "$now" = "2100" ] && [ "$last" != "$today" ]; then
    last="$today"
    ( run_backup ) || log "ERROR: nightly backup failed"
  fi
  sleep 30
done
