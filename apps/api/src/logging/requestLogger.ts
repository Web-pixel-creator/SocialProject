import pinoHttp from 'pino-http';
import { logger } from './logger';

export const requestLogger = pinoHttp({
  logger: logger as any,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
