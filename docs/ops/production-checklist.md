# Production Checklist

For release execution and rollback decisions, use:
- `docs/ops/release-runbook.md`
- `docs/ops/release-checklist.md`
- `docs/ops/rollback-playbook.md`
- `docs/ops/web-e2e-ci-runbook.md`

## Environment
- [ ] Run `npm run release:preflight:env` in the deployment environment.
- [ ] Set `NODE_ENV=production`
- [ ] Set `DATABASE_URL` / `REDIS_URL`
- [ ] Set `S3_*` credentials and bucket
- [ ] Set `JWT_SECRET` and `CSRF_TOKEN` to strong values
- [ ] Set `ADMIN_API_TOKEN`
- [ ] Set `EMBEDDING_PROVIDER=jina` and `EMBEDDING_API_KEY` if using Jina
- [ ] Set `FRONTEND_URL` to the deployed web origin
- [ ] Review `docs/ops/secrets-and-policies.md`

## Database
- [ ] Run migrations: `npm --workspace apps/api run migrate:up`
- [ ] Ensure new migrations use timestamp prefixes (e.g. `npm --workspace apps/api run migrate:create -- <name>`)
- [ ] Verify `embedding_events` table exists

## Health & Readiness
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `GET /ready` returns `{"status":"ok","db":"ok","redis":"ok"}`

## Jobs
- [ ] Confirm `JOBS_ENABLED=true` in prod
- [ ] Verify cron runs (budget reset, reels, autopsy, retention, embedding backfill)

## Backfill / Telemetry
- [ ] Backfill embeddings (optional): `npm --workspace apps/api run backfill:embeddings`
- [ ] Check metrics: `GET /api/admin/embeddings/metrics` with `x-admin-token`
- [ ] Check system metrics: `GET /api/admin/system/metrics` with `x-admin-token`

## Observability
- [ ] Log level set via `LOG_LEVEL`
- [ ] Alerts for API 5xx rate and job failures
- [ ] Review `docs/ops/observability-runbook.md` and verify dashboard links are configured
- [ ] Review `docs/ops/performance-gate.md` and confirm thresholds match current baseline
- [ ] Review `docs/ops/monitoring.md` and `docs/ops/alerts.md`

## Backups & Recovery
- [ ] Configure database backups and PITR
- [ ] Enable object storage versioning/replication
- [ ] Schedule a restore drill
- [ ] Review `docs/ops/backup-restore.md`

## Security
- [ ] Confirm CORS `FRONTEND_URL`
- [ ] Verify rate limits are enabled
- [ ] Ensure admin token is kept private
- [ ] Run `npm run security:check` (or verify CI green)
- [ ] Review `docs/ops/security-hygiene-gate.md`
- [ ] Review `docs/ops/secret-rotation.md`
