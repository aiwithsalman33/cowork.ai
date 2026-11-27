#!/bin/sh
# CoWork AI — restore a database backup (audit C3).
#
#   restore.sh db/coworkai-20261128-2100.dump.gz              → restores into a NEW scratch database
#   restore.sh db/coworkai-20261128-2100.dump.gz --into-live  → replaces the live database (asks first)
#   restore.sh --list                                         → shows available backups
#
# Run inside the backup container:  docker compose -f docker-compose.prod.yml exec backup /backup/restore.sh …
set -eu

log() { echo "[restore] $*"; }

# rclone needs no config file (the remote comes from env); an empty one keeps it quiet
export RCLONE_CONFIG="${TMPDIR:-/tmp}/rclone.conf"
: > "$RCLONE_CONFIG"
export RCLONE_CONFIG_STORE_TYPE=s3
export RCLONE_CONFIG_STORE_PROVIDER="${BACKUP_S3_PROVIDER:-Other}"
export RCLONE_CONFIG_STORE_ENDPOINT="${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is not set}"
export RCLONE_CONFIG_STORE_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:?}"
export RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:?}"
export RCLONE_CONFIG_STORE_REGION="${BACKUP_S3_REGION:-auto}"
export RCLONE_CONFIG_STORE_NO_CHECK_BUCKET=true
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
DEST="store:${BACKUP_S3_BUCKET:?}"
HOST="${PGHOST:-db}"
PGU="${POSTGRES_USER:-cowork}"
LIVE="${POSTGRES_DB:-cowork}"

command -v rclone >/dev/null 2>&1 || apk add --no-cache rclone age >/dev/null

if [ "${1:-}" = "--list" ]; then
  rclone lsl "$DEST/db" | sort -k2,3
  exit 0
fi

object="${1:?usage: restore.sh <object-name> [--into-live] | --list}"
mode="${2:-scratch}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

start=$(date +%s)
log "downloading $object"
rclone copyto "$DEST/$object" "$work/backup.dump.gz"
gunzip "$work/backup.dump.gz"

if [ "$mode" = "--into-live" ]; then
  printf '%s' "This REPLACES the live database \"$LIVE\". Stop the app first. Type the database name to continue: "
  read -r answer
  [ "$answer" = "$LIVE" ] || { log "cancelled"; exit 1; }
  target="$LIVE"
  pg_restore -h "$HOST" -U "$PGU" -d "$target" --clean --if-exists --no-owner "$work/backup.dump"
else
  target="restore_$(date -u '+%Y%m%d%H%M%S')"
  createdb -h "$HOST" -U "$PGU" "$target"
  pg_restore -h "$HOST" -U "$PGU" -d "$target" --no-owner "$work/backup.dump"
fi

log "restored into database \"$target\" in $(( $(date +%s) - start ))s"
for t in User Message Payment; do
  n=$(psql -h "$HOST" -U "$PGU" -d "$target" -tAc "SELECT count(*) FROM \"$t\"")
  log "  $t rows: $n"
done
[ "$target" = "$LIVE" ] || log "check it, then drop it with: dropdb -h $HOST -U $PGU $target"
