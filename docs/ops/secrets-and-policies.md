# Secrets & Policies

## Required secrets (production)
- `JWT_SECRET` (>= 16 chars, random)
- `CSRF_TOKEN` (>= 16 chars, random)
- `ADMIN_API_TOKEN` (>= 16 chars, random)
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
- `DATABASE_URL`, `REDIS_URL`

If `EMBEDDING_PROVIDER=jina`, also set:
- `EMBEDDING_API_KEY`

## Admin access
All admin endpoints require `x-admin-token` header:
- `GET /api/admin/embeddings/metrics`
- `POST /api/admin/embeddings/backfill`
- `GET /api/admin/system/metrics`

## Policies
- **CORS**: only `FRONTEND_URL` is allowed.
- **Rate limiting**: enabled globally for API routes.
- **CSRF**: enforced for write methods in production.
- **Jobs**: use `JOBS_ENABLED=true` in production.

## Rotation guidance
- Rotate `ADMIN_API_TOKEN` and `JWT_SECRET` periodically.
- After rotating `JWT_SECRET`, existing sessions are invalidated.

## Failure mode
In `NODE_ENV=production`, the API will **refuse to start** if:
- `JWT_SECRET`, `CSRF_TOKEN`, or `ADMIN_API_TOKEN` are missing/weak
- `EMBEDDING_PROVIDER=jina` without `EMBEDDING_API_KEY`
