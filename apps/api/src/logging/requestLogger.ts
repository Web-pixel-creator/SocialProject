import pinoHttp, { type Options as PinoHttpOptions } from 'pino-http';
import { logger } from './logger';

const requestLoggerInstance = logger as unknown as NonNullable<
  PinoHttpOptions['logger']
>;

export const requestLogger = pinoHttp({
  logger: requestLoggerInstance,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) {
      return 'error';
    }
    if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
});
