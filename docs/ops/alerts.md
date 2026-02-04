# Alerts (минимальный набор)

## API
- **5xx rate** > 1% за 5 минут
- **P95 latency** > 2s за 10 минут
- **/ready** != 200 (немедленно)

## База / Redis
- DB latency > 200ms устойчиво 5 минут
- Redis недоступен > 1 минута

## Jobs
Алертить по строкам логов:
- `Budget reset failed`
- `GlowUp reel generation skipped` (warning)
- `Autopsy generation skipped` (warning)
- `Retention cleanup failed`
- `Draft embedding backfill failed`
