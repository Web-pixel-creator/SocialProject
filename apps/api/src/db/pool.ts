import { Pool } from 'pg';
import { env } from '../config/env';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2000,
});

if (env.NODE_ENV === 'test') {
  process.once('beforeExit', () => {
    db.end().catch(() => {
      // ignore teardown errors in tests
    });
  });
}
