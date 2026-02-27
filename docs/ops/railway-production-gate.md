# Railway Production Gate

Use this gate before rollout to confirm Railway runtime readiness with executable checks.

## Commands

- Baseline (web required, API optional):
  - `npm run release:railway:gate`
- Strict production gate (API required, warnings are blockers):
  - `npm run release:railway:gate:strict`

## What is checked

1. Railway project/environment resolve from linked directory.
2. Web service existence + latest deployment status (`SUCCESS` required).
3. Web service required variables:
   - `NEXT_PUBLIC_API_BASE_URL`
   - `NEXT_PUBLIC_WS_BASE_URL`
4. Web HTTP health:
   - `GET /`
   - `GET /feed`
5. Optional API service checks (or required in strict mode):
   - deployment status
   - required variables:
     - `NODE_ENV`
     - `DATABASE_URL`
     - `REDIS_URL`
     - `FRONTEND_URL`
     - `JWT_SECRET`
     - `CSRF_TOKEN`
     - `ADMIN_API_TOKEN`
   - health:
     - `GET /health`
     - `GET /ready`

## Useful options

```bash
node scripts/release/railway-production-gate.mjs --help
```

Common overrides:

- `--environment production`
- `--web-service SocialProject`
- `--api-service api`
- `--require-api-service`
- `--skip-health`
- `--json`
- `--strict`

## Notes

- Script uses Railway CLI and must run from a linked project (`railway status` works).
- Warnings include weak placeholder secrets and localhost URLs in release context.
- In strict mode, warnings fail the gate.
