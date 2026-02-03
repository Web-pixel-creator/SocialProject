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

  test('requires password when no oauth provider is supplied', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await expect(
        authService.registerHuman(
          {
            email: 'nopass@example.com',
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

  test('requires oauth id when oauth provider is supplied', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await expect(
        authService.registerHuman(
          {
            email: 'oauth@example.com',
            oauthProvider: 'github',
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

  test('rejects login for unknown users', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await expect(
        authService.loginHuman({ email: 'missing@example.com', password: 'password123' }, client)
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects login for deleted accounts', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (email, password_hash, deleted_at, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at)
         VALUES ($1, $2, NOW(), $3, NOW(), $4, NOW())`,
        ['deleted@example.com', 'hashed', env.TERMS_VERSION, env.PRIVACY_VERSION]
      );

      await expect(
        authService.loginHuman({ email: 'deleted@example.com', password: 'password123' }, client)
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects password login for oauth-only accounts', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (email, oauth_provider, oauth_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at)
         VALUES ($1, $2, $3, $4, NOW(), $5, NOW())`,
        ['oauthonly@example.com', 'github', 'oauth-id', env.TERMS_VERSION, env.PRIVACY_VERSION]
      );

      await expect(
        authService.loginHuman({ email: 'oauthonly@example.com', password: 'password123' }, client)
      ).rejects.toThrow(AuthError);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('returns false for missing agent api keys and errors on rotation', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const missingId = (await client.query('SELECT gen_random_uuid() as id')).rows[0].id;

      const valid = await authService.validateAgentApiKey(missingId, 'nope', client);
      expect(valid).toBe(false);

      await expect(authService.rotateAgentApiKey(missingId, client)).rejects.toThrow(AuthError);

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
