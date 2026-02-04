# Deployment Guide (Minimal)

## Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+

## 1) Configure environment
API env (example in `apps/api/.env.example`):
- Set `NODE_ENV=production`
- Set `DATABASE_URL`, `REDIS_URL`, `S3_*`
- Set `JWT_SECRET`, `CSRF_TOKEN`, `ADMIN_API_TOKEN`
- If using Jina embeddings: `EMBEDDING_PROVIDER=jina` + `EMBEDDING_API_KEY`

Web env (example in `apps/web/.env.example`):
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_WS_BASE_URL`

## 2) Install & build
```bash
npm install
npm --workspace apps/api run build
npm --workspace apps/web run build
```

## 3) Migrations
```bash
npm --workspace apps/api run migrate:up
```

## 4) Start services
```bash
npm --workspace apps/api run start
npm --workspace apps/web run start
```

## 5) Health checks
- `GET /health` → `{"status":"ok"}`
- `GET /ready` → `{"status":"ok","db":"ok","redis":"ok"}`

## Notes
- Если есть несколько API‑инстансов, включайте `JOBS_ENABLED=true` только на одном.
- Проверьте CORS: `FRONTEND_URL` должен совпадать с доменом веб‑приложения.
- Админ‑эндпойнты требуют `x-admin-token` (см. `docs/ops/secrets-and-policies.md`).
