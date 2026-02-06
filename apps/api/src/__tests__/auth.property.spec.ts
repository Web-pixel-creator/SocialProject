import fc from 'fast-check';
import { Pool } from 'pg';
import { env } from '../config/env';
import { AuthServiceImpl } from '../services/auth/authService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const authService = new AuthServiceImpl(pool);

describe('auth service properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 30: Agent API Key Validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          studioName: fc.string({ minLength: 3, maxLength: 30 }),
          personality: fc.string({ minLength: 3, maxLength: 60 }),
        }),
        async (input) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            const agent = await authService.registerAgent(input, client);
            const valid = await authService.validateAgentApiKey(
              agent.agentId,
              agent.apiKey,
              client,
            );
            const invalid = await authService.validateAgentApiKey(
              agent.agentId,
              'invalid-key',
              client,
            );

            expect(valid).toBe(true);
            expect(invalid).toBe(false);

            await client.query('ROLLBACK');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        },
      ),
      { numRuns: 50 },
    );
  }, 30_000);

  test('Property 32: API Key Rotation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          studioName: fc.string({ minLength: 3, maxLength: 30 }),
          personality: fc.string({ minLength: 3, maxLength: 60 }),
        }),
        async (input) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            const agent = await authService.registerAgent(input, client);
            const rotated = await authService.rotateAgentApiKey(
              agent.agentId,
              client,
            );

            const oldValid = await authService.validateAgentApiKey(
              agent.agentId,
              agent.apiKey,
              client,
            );
            const newValid = await authService.validateAgentApiKey(
              agent.agentId,
              rotated.apiKey,
              client,
            );

            expect(oldValid).toBe(false);
            expect(newValid).toBe(true);

            await client.query('ROLLBACK');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        },
      ),
      { numRuns: 30 },
    );
  }, 30_000);

  test('Property 70: Terms and Privacy Consent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          password: fc.string({ minLength: 8, maxLength: 24 }),
        }),
        async (input) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            await expect(
              authService.registerHuman(
                {
                  email: input.email,
                  password: input.password,
                  consent: { termsAccepted: false, privacyAccepted: false },
                },
                client,
              ),
            ).rejects.toThrow();

            const registered = await authService.registerHuman(
              {
                email: `${input.email}.ok`,
                password: input.password,
                consent: {
                  termsAccepted: true,
                  privacyAccepted: true,
                  termsVersion: env.TERMS_VERSION,
                  privacyVersion: env.PRIVACY_VERSION,
                },
              },
              client,
            );

            const stored = await client.query(
              'SELECT terms_version, terms_accepted_at, privacy_version, privacy_accepted_at FROM users WHERE id = $1',
              [registered.userId],
            );

            expect(stored.rows[0].terms_version).toBe(env.TERMS_VERSION);
            expect(stored.rows[0].privacy_version).toBe(env.PRIVACY_VERSION);
            expect(stored.rows[0].terms_accepted_at).toBeTruthy();
            expect(stored.rows[0].privacy_accepted_at).toBeTruthy();

            await client.query('ROLLBACK');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        },
      ),
      { numRuns: 30 },
    );
  }, 30_000);
});
