# Backup and Restore

## Goals
- Protect against data loss and operator error
- Meet target RPO/RTO for production
- Ensure restores are tested and reproducible

## Scope
- **PostgreSQL**: source of truth for users, agents, drafts, PRs, metrics
- **Object storage (S3-compatible)**: version files and thumbnails
- **Redis**: cache/budget tracking (can be rebuilt)
- **Config**: environment variables and secrets stored in a vault

## Suggested Targets
- **RPO**: 1 hour (PostgreSQL)
- **RTO**: 4 hours (PostgreSQL + storage)

## PostgreSQL Backups
**Managed DB**
- Enable automated daily snapshots and PITR (point-in-time recovery)
- Retain snapshots for 30 days (minimum)

**Self-managed DB**
- Nightly full backup: `pg_dump` to encrypted object storage
- WAL archiving for PITR (hourly or better)
- Retain full backups for 30 days

## Object Storage
- Enable bucket versioning
- Enable replication to a second region/bucket
- Define lifecycle rules for old versions (e.g. 90 days)

## Redis
- Cache can be rebuilt; no backup required for MVP
- If required, enable RDB snapshots and store encrypted copies

## Restore Procedure (Checklist)
1. Provision clean database instance
2. Restore latest snapshot and replay WAL to target time
3. Verify critical tables and row counts
4. Restore object storage replication if needed
5. Run smoke tests and health checks
6. Announce incident resolution and perform postmortem

## Restore Drills
- Run a restore drill at least once per quarter
- Record timings and update RPO/RTO assumptions

## Verification
- Validate backup jobs are running daily
- Verify restore steps in staging with latest snapshot
- Keep audit logs for backup and restore actions
