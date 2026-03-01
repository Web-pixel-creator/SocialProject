# Agent Gateway + AI Runtime Runbook

Use this runbook for incidents that affect:
- `POST /api/admin/agent-gateway/orchestrate`
- `GET|POST /api/admin/agent-gateway/sessions*`
- `GET /api/admin/ai-runtime/health`
- `POST /api/admin/ai-runtime/dry-run`

This runbook complements:
- `docs/ops/observability-runbook.md`
- `docs/ops/release-runbook.md`
- `docs/ops/rollback-playbook.md`

## Owners

- Primary owner: Backend/API on-call.
- Secondary owner: Platform on-call.
- Escalation owner: Release commander (during release windows).

## Preconditions

- `x-admin-token` is available and valid.
- API base URL is known (`$API_BASE_URL`).
- `jq` is available for JSON inspection (optional but recommended).

Example:

```bash
export API_BASE_URL="https://api.example.com"
export ADMIN_API_TOKEN="..."
```

## Fast Triage (5-10 minutes)

1. Check global API health:

```bash
curl -s "$API_BASE_URL/health"
curl -s "$API_BASE_URL/ready"
```

2. Check AI runtime health snapshot:

```bash
curl -s "$API_BASE_URL/api/admin/ai-runtime/health" \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

3. Inspect role/provider profile configuration:

```bash
curl -s "$API_BASE_URL/api/admin/ai-runtime/profiles" \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

4. Inspect recent gateway sessions from persistent store:

```bash
curl -s "$API_BASE_URL/api/admin/agent-gateway/sessions?source=db&limit=20" \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

5. Run a deterministic dry-run probe:

```bash
curl -s "$API_BASE_URL/api/admin/ai-runtime/dry-run" \
  -H "x-admin-token: $ADMIN_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "role": "critic",
    "prompt": "health probe: summarize fallback readiness",
    "timeoutMs": 12000
  }'
```

## Operational SLO Checks

Treat runtime/gateway as degraded when any of the following is true:

- `summary.health = "degraded"` on `/admin/ai-runtime/health`.
- `summary.rolesBlocked > 0` for more than 5 minutes.
- `summary.providersCoolingDown` remains > 50% of provider pool for more than 10 minutes.
- `orchestrate` requests return repeated `503` or produce only failed attempts.
- Gateway sessions pile up in `active` state without new events for more than 15 minutes.

## Incident Playbooks

### A) AI provider failover cascade

Symptoms:
- Dry-run returns `failed: true`.
- Attempts contain repeated `AI_PROVIDER_TIMEOUT`, `AI_PROVIDER_HTTP_ERROR`, or `AI_PROVIDER_UNAVAILABLE`.
- Runtime health reports blocked roles or widespread cooldown.

Actions:
1. Confirm scope with `/admin/ai-runtime/health` and `/admin/ai-runtime/profiles`.
2. Validate runtime adapter env config:
   - `AI_RUNTIME_USE_HTTP_ADAPTERS`
   - `AI_RUNTIME_<PROVIDER>_ENDPOINT`
   - `AI_RUNTIME_<PROVIDER>_API_KEY`
   - `AI_RUNTIME_<PROVIDER>_MODEL`
   - `AI_PROVIDER_COOLDOWN_MS`
3. If one provider is unhealthy:
   - remove it from model chain env (`AI_*_MODEL_CHAIN`) in deployment config,
   - redeploy API,
   - verify dry-run now succeeds via fallback provider.
4. If all providers fail due to external outage:
   - switch to degraded mode communication in status channel,
   - keep orchestration enabled only for critical drafts,
   - prepare rollback if user-visible failure rate breaches release thresholds.

Verification:
- Dry-run succeeds for each role (`author`, `critic`, `maker`, `judge`).
- `/admin/ai-runtime/health` returns `summary.health = "ok"`.

### B) Agent Gateway session backlog / event growth

Symptoms:
- Large number of stale `active` sessions.
- Session timelines stop advancing, observers see stale orchestration state.
- Logs contain repeated gateway background write failures.

Actions:
1. Identify stale sessions:

```bash
curl -s "$API_BASE_URL/api/admin/agent-gateway/sessions?source=db&limit=100" \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

2. Inspect one session:

```bash
SESSION_ID="<session-id>"
curl -s "$API_BASE_URL/api/admin/agent-gateway/sessions/$SESSION_ID/status?source=db" \
  -H "x-admin-token: $ADMIN_API_TOKEN"
curl -s "$API_BASE_URL/api/admin/agent-gateway/sessions/$SESSION_ID/summary?source=db" \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

3. Compact oversized sessions:

```bash
curl -s "$API_BASE_URL/api/admin/agent-gateway/sessions/$SESSION_ID/compact" \
  -H "x-admin-token: $ADMIN_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"keepRecent": 40}'
```

4. Close abandoned sessions:

```bash
curl -s "$API_BASE_URL/api/admin/agent-gateway/sessions/$SESSION_ID/close" \
  -H "x-admin-token: $ADMIN_API_TOKEN" \
  -X POST
```

5. If writes still fail, check DB readiness and rollback release if needed.

Verification:
- Stale active session count returns to baseline.
- New orchestration sessions append events and close normally.

### C) Orchestration disabled or misconfigured

Symptoms:
- `/admin/agent-gateway/orchestrate` returns `AGENT_ORCHESTRATION_DISABLED`.

Actions:
1. Confirm feature flag value:
   - `AGENT_ORCHESTRATION_ENABLED=true`
2. Redeploy with corrected env if needed.
3. Re-run orchestration probe:

```bash
curl -s "$API_BASE_URL/api/admin/agent-gateway/orchestrate" \
  -H "x-admin-token: $ADMIN_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"draftId":"<draft-id>","channel":"release-check"}'
```

Verification:
- Endpoint returns `201` and session metadata.
- Session status transitions and events are visible in gateway endpoints.

## Release Window Checks (Mandatory)

During production rollout and post-release verification:

1. Run runtime snapshot check:
   - `/api/admin/ai-runtime/health` must report no blocked roles.
2. Run at least one dry-run probe:
   - each critical role path must succeed or fall back cleanly.
3. Confirm gateway health:
   - no abnormal growth of stale active sessions,
   - no sustained `AGENT_GATEWAY_SESSION_NOT_FOUND` spikes for active IDs.

If these fail for longer than 10 minutes, follow rollback thresholds in:
- `docs/ops/rollback-playbook.md`

## Connector Ingest Profiles (Optional Runtime Defaults)

Use `AGENT_GATEWAY_INGEST_CONNECTOR_PROFILES` to provide per-connector defaults
for `/api/agent-gateway/adapters/ingest` when external payloads omit one or more fields:
- `adapter`
- `channel`
- `fromRole`
- `toRole`
- `type`

Example:

```json
{
  "telegram_main": {
    "adapter": "external_webhook",
    "channel": "telegram",
    "fromRole": "observer",
    "toRole": "author",
    "type": "observer_message"
  },
  "slack_main": "slack"
}
```

Ready-to-copy example file:
- `docs/ops/examples/agent-gateway-ingest-connector-profiles.example.json`

Notes:
- Explicit request-body values always win over profile defaults.
- If `externalSessionId` is omitted, ingest attempts channel-aware fallback extraction:
  - `telegram`: `message.chat.id` / related update shapes,
  - `slack`: `event.channel` / `channel.id`,
  - `discord`: `channel_id` / `d.channel_id`.
- Optional strict mode: `AGENT_GATEWAY_INGEST_ENFORCE_CONNECTOR_PROFILE=true`
  rejects requests that conflict with configured profile fields (`adapter`,
  `channel`, `fromRole`, `toRole`, `type`).
- Invalid profile JSON fails fast on API startup.
- Profile configuration is visible in:
  - `GET /api/admin/agent-gateway/telemetry?hours=24&limit=200` (`connectorProfiles`)
  - `GET /api/admin/agent-gateway/adapters?hours=24` (`connectorProfiles`)
- Release-gate connector diagnostics:
  - `production-launch-gate` summary includes:
    - `ingestExternalChannelFallback`
    - `ingestExternalChannelFailureModes`
  - per-channel trace/failure details are stored in:
    - `artifacts/release/production-agent-gateway-external-channel-traces.json`
    - workflow artifact: `production-external-channel-traces`.

### External-channel failure-mode routing (release gate)

When launch-gate reports non-empty `ingestExternalChannelFailureModes.failedChannels`
or `requiredFailedChannels`, route by `failureMode`:

| failureMode | Typical signal | First operator actions | Escalate to |
| --- | --- | --- | --- |
| `ingest_http_error` | Ingest probe returns non-`201` | Check `RELEASE_AGENT_GATEWAY_WEBHOOK_SECRET`, API URL, and `/api/agent-gateway/adapters/ingest` route health; inspect API response body/status in workflow logs. | Backend/API on-call |
| `ingest_not_applied` | `ingestApplied=false` despite `201` | Check ingest response payload for policy rejects/conflicts; validate connector profile strictness (`AGENT_GATEWAY_INGEST_ENFORCE_CONNECTOR_PROFILE`) and channel profile fields. | Backend/API on-call |
| `sessions_lookup_error` | Admin sessions lookup non-`200` | Verify `RELEASE_ADMIN_API_TOKEN` and `/api/admin/agent-gateway/sessions` health; check DB readiness and admin-token scope. | Backend/API + Platform |
| `fallback_session_mismatch` | Resolved external session differs from expected fallback id | Compare channel payload shape vs connector extractor expectations (`telegram` chat id, `slack` channel id, `discord` channel id); validate connector profile `channel` value. | Backend/API on-call |
| `telemetry_http_error` | Admin telemetry endpoint non-`200` | Verify `/api/admin/agent-gateway/telemetry` availability and admin token; check API deploy health and recent errors. | Backend/API + Platform |
| `telemetry_no_connector_events` | Telemetry total remains `0` for channel/connector | Confirm telemetry query window/filters; verify connector id and channel labels in profile map; inspect ingest logs for dropped events. | Backend/API on-call |
| `telemetry_zero_accepted` | Telemetry has events but accepted count is `0` | Inspect rejection reasons in ingest telemetry; validate webhook secret and profile constraints, and check payload schema drift. | Backend/API on-call |
| `unknown` | None of known predicates matched | Download `production-external-channel-traces` + launch summary, attach raw check payloads, and open incident with run URL + commit SHA. | Release commander |

Hard stop rule for release window:
- if `requiredFailedChannels` is non-empty for more than one consecutive strict run,
  pause rollout and use rollback thresholds from `docs/ops/rollback-playbook.md`.

## Security Notes

- Admin endpoints must never be exposed without `x-admin-token`.
- Keep `AI_RUNTIME_*_API_KEY` values in secrets manager only.
- Do not include provider secrets in incident logs or chat threads.
- Keep dry-run prompts non-sensitive during diagnostics.

## Incident Evidence to Capture

- Runtime health snapshot payload (`/admin/ai-runtime/health`).
- Dry-run attempts payload with error codes.
- Session summary payload for affected gateway session IDs.
- Deployment version / commit SHA.
- Timeline and mitigation actions for postmortem.
