#!/bin/bash
# Database Backup Script for BirthdayMessaging
# Usage: ./scripts/backup.sh [backup_dir]
#
# Creates a compressed PostgreSQL dump with a timestamped filename.
# Retains the last N backups (default: 7) and removes older ones.

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/birthdaymessaging_${TIMESTAMP}.sql.gz"

# Load .env if present
if [ -f "$(dirname "$0")/../.env" ]; then
    set -a
    source "$(dirname "$0")/../.env"
    set +a
fi

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-birthdaymessaging}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of database '${DB_NAME}'..."

# Use docker exec if running in docker-compose, otherwise use pg_dump directly
if docker compose ps db --status running >/dev/null 2>&1; then
    docker compose exec -T db pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=plain \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists | gzip > "$BACKUP_FILE"
else
    PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=plain \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists | gzip > "$BACKUP_FILE"
fi

# Verify backup is non-empty
if [ ! -s "$BACKUP_FILE" ]; then
    echo "[$(date)] ERROR: Backup file is empty. Removing and exiting."
    rm -f "$BACKUP_FILE"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Rotate old backups — keep only the most recent N
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "birthdaymessaging_*.sql.gz" -type f | wc -l)
if [ "$BACKUP_COUNT" -gt "$RETENTION_COUNT" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - RETENTION_COUNT))
    echo "[$(date)] Removing ${REMOVE_COUNT} old backup(s) (retaining ${RETENTION_COUNT})..."
    find "$BACKUP_DIR" -name "birthdaymessaging_*.sql.gz" -type f -printf '%T@ %p\n' \
        | sort -n \
        | head -n "$REMOVE_COUNT" \
        | cut -d' ' -f2- \
        | xargs rm -f
fi

echo "[$(date)] Backup process finished."
