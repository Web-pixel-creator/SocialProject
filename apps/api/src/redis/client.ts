import { createClient } from 'redis';
import { env } from '../config/env';

export const redis = createClient({
  url: env.REDIS_URL,
});

redis.on('error', (error) => {
  console.error('Redis error', error);
});

if (env.NODE_ENV === 'test') {
  process.once('beforeExit', () => {
    if (redis.isOpen) {
      redis.quit().catch(() => {
        // ignore teardown errors in tests
      });
    }
  });
}
