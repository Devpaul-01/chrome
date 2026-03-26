#!/bin/bash
# Database Restore Script for BirthdayMessaging
# Usage: ./scripts/restore.sh <backup_file>
#
# Restores a compressed PostgreSQL dump into the database.
# WARNING: This will DROP and recreate all tables in the target database.

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lht ./backups/birthdaymessaging_*.sql.gz 2>/dev/null || echo "  No backups found in ./backups/"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

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

echo "========================================"
echo "  DATABASE RESTORE"
echo "========================================"
echo "  File:     ${BACKUP_FILE}"
echo "  Database: ${DB_NAME}"
echo "  Host:     ${DB_HOST}:${DB_PORT}"
echo "========================================"
echo ""
echo "WARNING: This will overwrite all data in '${DB_NAME}'."
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo "[$(date)] Starting restore..."

if docker compose ps db --status running >/dev/null 2>&1; then
    gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --single-transaction \
        --set ON_ERROR_STOP=on
else
    PGPASSWORD="${POSTGRES_PASSWORD:-}" gunzip -c "$BACKUP_FILE" | psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --single-transaction \
        --set ON_ERROR_STOP=on
fi

echo "[$(date)] Restore completed successfully."
echo ""
echo "Post-restore checklist:"
echo "  1. Verify the application starts correctly"
echo "  2. Check that Alembic migrations are consistent: alembic current"
echo "  3. Run a quick smoke test of the API"
