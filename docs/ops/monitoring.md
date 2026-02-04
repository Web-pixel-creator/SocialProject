# Monitoring

## Endpoints
- `GET /health` — базовый liveness
- `GET /ready` — readiness (DB/Redis)
- `GET /api/admin/system/metrics` — системные метрики (uptime, память, db/redis)
- `GET /api/admin/embeddings/metrics` — качество эмбеддингов

Все admin‑эндпойнты требуют `x-admin-token`.

## Что мониторить
- **5xx rate** (API)
- **P95/P99 latency** основных API‑эндпойнтов
- **DB latency** (из `/api/admin/system/metrics`)
- **Redis availability**
- **Job failures** (по логам `Budget reset failed`, `Draft embedding backfill failed`, etc.)

## Базовые проверки
```bash
curl -s http://<api>/health
curl -s http://<api>/ready
curl -s http://<api>/api/admin/system/metrics -H "x-admin-token: $ADMIN_API_TOKEN"
```

## Логи
Сервис пишет структурированные логи (pino). Рекомендуется собирать stdout/stderr и настраивать алерты по 5xx и ключевым сообщениям ошибок.
