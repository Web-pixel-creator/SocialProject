# Observability Runbook

Use this runbook for release-time health checks and incident response.

## Owners

- Primary owner: Platform/Operations.
- Service owners: Backend owner (API/jobs), Frontend owner (web UX impact).
- Escalation owner: Release commander (during active release window).

## Dashboard Links

Replace `<OBS_BASE_URL>` with your monitoring base URL.

- API Overview: `<OBS_BASE_URL>/dashboards/finishit-api-overview`
- Jobs and Scheduler: `<OBS_BASE_URL>/dashboards/finishit-jobs`
- Data Stores (PostgreSQL/Redis): `<OBS_BASE_URL>/dashboards/finishit-datastores`
- Release Health: `<OBS_BASE_URL>/dashboards/finishit-release-health`
- Admin metrics fallback:
  - `GET /api/admin/system/metrics` (`x-admin-token` required)
  - `GET /api/admin/embeddings/metrics` (`x-admin-token` required)

## Core SLI/SLO and Alert Thresholds

| SLI | SLO Target | Warning Threshold | Critical Threshold | Source |
|---|---|---|---|---|
| API availability (`/health`) | >= 99.9% (30d) | < 99.7% (30m) | < 99.5% (10m) | Uptime checks |
| API readiness (`/ready`) | >= 99.95% (30d) | 2 consecutive failures | 5+ minutes failing | Uptime checks |
| API 5xx rate | < 1.0% (5m rolling) | > 1.0% for 5m | > 3.0% for 10m | API metrics |
| API latency p95 | < 800ms (10m rolling) | > 1200ms for 10m | > 2000ms for 10m | API metrics |
| DB query latency p95 | < 200ms (10m rolling) | > 300ms for 10m | > 500ms for 10m | DB metrics |
| Redis availability | >= 99.95% (30d) | 1 minute degraded | > 3 minutes unavailable | Redis metrics |
| Scheduled job success rate | >= 99% (24h) | < 98% (24h) | < 95% (24h) | Job logs/metrics |

## Alert Severity and Escalation

| Severity | Definition | Initial Action | Ack SLA | Escalation |
|---|---|---|---|---|
| SEV-1 | Active user impact or data risk | Immediate paging, start incident bridge | 5 min | Platform + Backend + Release commander immediately |
| SEV-2 | Partial degradation, no confirmed data loss | Page on-call owner, begin mitigation | 15 min | Escalate to release commander after 30 min unresolved |
| SEV-3 | Non-critical degradation or noisy signal | Create triage ticket | 1 business day | Escalate in weekly ops review if recurring |

Escalation order:
1. Service owner on-call.
2. Release commander.
3. Platform owner.
4. Product/Support notification (if customer-visible).

## Incident Logging Template

Record each incident with these fields:

- `incident_id`:
- `severity`:
- `detected_at_utc`:
- `acknowledged_at_utc`:
- `mitigated_at_utc`:
- `resolved_at_utc`:
- `root_cause`:
- `impact_summary`:
- `affected_components`:
- `trigger_metric`:
- `timeline`:
- `actions_taken`:
- `owner`:
- `follow_up_tasks`:

## MTTD and MTTR Tracking

- `MTTD = acknowledged_at_utc - detected_at_utc`
- `MTTR = mitigated_at_utc - detected_at_utc`

Review MTTD/MTTR monthly and adjust thresholds if alert noise or slow detection is observed.
