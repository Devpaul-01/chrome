# Database Backup & Restore Guide

## Overview

The BirthdayMessaging backend uses PostgreSQL 15. Backups are plain-SQL dumps compressed with gzip, stored in the `backend/backups/` directory.

---

## Automated Backups (Docker)

The `db-backup` service in `docker-compose.yml` runs automatically and:

- Creates a compressed backup every **24 hours**
- Retains the **last 7 backups** and deletes older ones
- Stores backups in `backend/backups/`

Start it alongside the other services:

./startup.ps1 (in Powershell)

OR

```bash
docker compose up -d
```


To trigger an immediate backup without waiting for the schedule, restart the backup service:

```bash
docker compose restart db-backup
```

---

## Manual Backup

From the `backend/` directory:

```bash
# Using the backup script (auto-detects Docker or direct connection)
./scripts/backup.sh

# Or specify a custom backup directory
./scripts/backup.sh /path/to/backup/dir
```

### Configuration

The backup script reads from `.env` or environment variables:

| Variable                 | Default          | Description                     |
| ------------------------ | ---------------- | ------------------------------- |
| `POSTGRES_HOST`          | `localhost`      | Database host                   |
| `POSTGRES_PORT`          | `5432`           | Database port                   |
| `POSTGRES_USER`          | `postgres`       | Database user                   |
| `POSTGRES_PASSWORD`      | *(empty)*        | Database password               |
| `POSTGRES_DB`            | `birthdaymessaging` | Database name                |
| `BACKUP_RETENTION_COUNT` | `7`              | Number of backups to keep       |

---

## Restore Procedure

> **WARNING:** Restoring a backup will **overwrite all current data** in the target database. Make a fresh backup first if needed.

### Steps

1. **Stop the application** (optional but recommended to prevent writes during restore):
   ./shutdown.ps1 (in Powershell)

   OR

   ```bash
   docker compose stop backend
   ```
2. **Run the restore script:**

   ```bash
   ./scripts/restore.sh ./backups/birthdaymessaging_20260325_020000.sql.gz
   ```

   The script will:
   - Show the file, database, and host being targeted
   - Ask for explicit confirmation (`yes`)
   - Restore inside a single transaction (all-or-nothing)
   - Abort on any SQL error

3. **Verify the restore:**

   ```bash
   # Check Alembic migration state
   docker compose exec backend alembic current

   # Restart the application
   ./startup.ps1
   OR
   docker compose start backend

   # Quick smoke test
   curl http://localhost:8000/health
   ```

### Restore Without Docker

If PostgreSQL is running directly (not in Docker):

```bash
POSTGRES_PASSWORD=yourpassword ./scripts/restore.sh ./backups/birthdaymessaging_20260325_020000.sql.gz
```

### Restoring to a Different Database

To restore into a fresh database (e.g., for testing):

```bash
# Create the target database
docker compose exec db createdb -U postgres birthdaymessaging_test

# Restore into it
POSTGRES_DB=birthdaymessaging_test ./scripts/restore.sh ./backups/birthdaymessaging_20260325_020000.sql.gz
```

---

## Backup File Format

| Property   | Value                                        |
| ---------- | -------------------------------------------- |
| Format     | Plain SQL, gzip-compressed                   |
| Naming     | `birthdaymessaging_YYYYMMDD_HHMMSS.sql.gz`  |
| Location   | `backend/backups/`                           |
| Includes   | Schema + data (no ownership/privileges)      |
| Excludes   | Roles, tablespaces                           |

---

## Disaster Recovery Checklist

1. **Locate the most recent backup** in `backend/backups/`
2. **Ensure the database server is running:** `docker compose up -d db`
3. **Stop the application:** `shutdown.ps1` OR `docker compose stop backend`
4. **Restore:** `./scripts/restore.sh ./backups/<latest_backup>.sql.gz`
5. **Verify migrations:** `docker compose exec backend alembic current`
6. **Restart:** `./startup.ps1` OR `docker compose start backend`
7. **Validate:** Check API health and key functionality

---

## Troubleshooting

| Problem | Solution |
| --- | --- |
| Empty backup file | Check that the `db` container is healthy: `docker compose ps` |
| "role does not exist" on restore | Backups use `--no-owner` so this shouldn't occur. If it does, ensure the target DB user exists. |
| Alembic version mismatch after restore | Run `alembic upgrade head` to apply any migrations newer than the backup. |
| Permission denied on scripts | `chmod +x scripts/backup.sh scripts/restore.sh` |
