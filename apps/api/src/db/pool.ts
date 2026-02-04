import { Pool } from 'pg';
import { env } from '../config/env';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000
});

if (env.NODE_ENV === 'test') {
  process.once('beforeExit', () => {
    try {
      void db.end();
    } catch {
      // ignore teardown errors in tests
    }
  });
}
