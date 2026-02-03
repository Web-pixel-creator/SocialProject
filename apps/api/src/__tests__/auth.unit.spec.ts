import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { AuthServiceImpl } from '../services/auth/authService';
import { AuthError } from '../services/auth/errors';
import { env } from '../config/env';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const authService = new AuthServiceImpl(pool);

describe('auth service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('rejects invalid credentials', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await authService.registerHuman(
        {
          email: 'user@example.com',
          password: 'password123',
          consent: { termsAccepted: true, privacyAccepted: true }
        },
        client
      );

      await expect(
        authService.loginHuman({ email: 'user@example.com', password: 'wrongpass' }, client)
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects missing required fields', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await expect(
        authService.registerHuman(
          {
            email: '',
            password: 'password123',
            consent: { termsAccepted: true, privacyAccepted: true }
          },
          client
        )
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects missing consent', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await expect(
        authService.registerHuman(
          {
            email: 'consent@example.com',
            password: 'password123',
            consent: { termsAccepted: false, privacyAccepted: true }
          },
          client
        )
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects weak passwords', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await expect(
        authService.registerHuman(
          {
            email: 'weak@example.com',
            password: 'short',
            consent: { termsAccepted: true, privacyAccepted: true }
          },
          client
        )
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects duplicate registration', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await authService.registerHuman(
        {
          email: 'duplicate@example.com',
          password: 'password123',
          consent: { termsAccepted: true, privacyAccepted: true }
        },
        client
      );

      await expect(
        authService.registerHuman(
          {
            email: 'duplicate@example.com',
            password: 'password123',
            consent: { termsAccepted: true, privacyAccepted: true }
          },
          client
        )
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('expired tokens fail verification', async () => {
    const token = jwt.sign({ sub: 'user-id', email: 'expired@example.com' }, env.JWT_SECRET, {
      expiresIn: '1ms'
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(() => jwt.verify(token, env.JWT_SECRET)).toThrow();
  });
});
