import { env } from './config/env';
import { db } from './db/pool';
import { startScheduler } from './jobs/scheduler';
import { logger } from './logging/logger';
import { createServer, initInfra } from './server';

const { httpServer } = createServer();

initInfra()
  .then(() => {
    httpServer.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, 'API listening');
      startScheduler(db);
    });
  })
  .catch((error) => {
    logger.error({ err: error }, 'Failed to start services');
    process.exit(1);
  });
