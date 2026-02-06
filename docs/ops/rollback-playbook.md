# Rollback Playbook

Use this playbook when release health degrades after deployment.

## 1. Rollback Triggers

Trigger rollback if any condition persists beyond the stated window:

- API 5xx rate > 3% for 10 minutes.
- API p95 latency breaches SLO by > 50% for 15 minutes.
- `/ready` fails for more than 5 minutes.
- Critical business flow fails at high rate (auth, draft write, PR decision, payment flow).
- Data integrity risk detected (corrupt writes, failed migration with partial state).

## 2. Roles and Responsibilities

- Release commander: owns go/no-go and rollback decision.
- Backend owner: executes API rollback and validates API smoke checks.
- Frontend owner: executes Web rollback and validates key pages.
- DB owner: evaluates migration rollback safety and data recovery actions.
- Incident scribe: records timeline and decisions.

## 3. Rollback Decision Tree

1. Is user impact critical and ongoing?
   - Yes: continue to step 2.
   - No: mitigate forward and monitor.
2. Did the incident start after this release?
   - Yes: continue to step 3.
   - No: treat as unrelated incident.
3. Is DB migration non-reversible or already consumed by new code paths?
   - Yes: prefer forward-fix with feature disable/traffic shift; involve DB owner immediately.
   - No: execute standard rollback (API/Web artifact rollback + migration rollback if safe).

## 4. Standard Rollback Procedure

1. Freeze further deployments.
2. Announce rollback start in ops channel.
3. Roll back Web to previous stable artifact.
4. Roll back API to previous stable artifact.
5. If migration is reversible and approved by DB owner, run DB rollback step.
6. Re-run smoke checks:
   - `GET /health`
   - `GET /ready`
   - Auth + draft + search critical flow
7. Confirm alert recovery and error-rate normalization.
8. Announce rollback complete.

## 5. Data-Safe Migration Guidance

- Expand/contract migrations: rollback app first, defer schema cleanup.
- Destructive migrations: do not auto-rollback schema; recover via restore/PITR plan.
- Any migration rollback must be approved by DB owner and logged.

## 6. Incident Log Template

Capture this in the incident ticket:

- Detected at (UTC):
- Mitigated at (UTC):
- Root cause:
- Impact summary:
- Trigger(s) that initiated rollback:
- Commands/actions executed:
- Owner(s):
- Follow-up actions and SLA:
