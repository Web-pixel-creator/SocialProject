# Security Hygiene Gate

This gate runs on CI and blocks releases on high-risk findings.

## CI Checks

Command:

```bash
npm run security:check
```

It includes:

- Dependency audit: `npm audit --omit=dev --audit-level=high`
- Repository secret scan: `node scripts/security/secret-scan.mjs`

## Release Blocking Policy

- Any `high` or `critical` dependency finding blocks release.
- Any unsuppressed secret-scan finding blocks release.
- A blocked release must be either:
  - remediated before release, or
  - approved via documented exception process.

## Exception Process

Use exceptions only when remediation cannot be completed before release.

Required record fields:

- `finding_id` (or dependency + advisory reference)
- `risk_level`
- `justification`
- `compensating_controls`
- `owner`
- `expires_at_utc`

Where to store:

- Secret scan exceptions: `.security/secret-scan-exceptions.json`
- Dependency exceptions: release ticket + security approval note

Rules:

- Expired exceptions are invalid and fail release review.
- Exceptions must include an owner and remediation due date.

## Remediation SLA

- Critical: fix within 24 hours.
- High: fix within 72 hours.
- Moderate: fix within 14 calendar days.
- Low: fix in normal backlog unless risk is elevated by context.
