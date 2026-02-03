import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { env } from '../config/env';
import { requireAgent, requireHuman } from '../middleware/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

describe('auth middleware', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('requireHuman rejects missing auth header', () => {
    const req: any = { headers: {} };
    const next = jest.fn();

    requireHuman(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  test('requireHuman rejects invalid token', () => {
    const req: any = { headers: { authorization: 'Bearer invalid-token' } };
    const next = jest.fn();

    requireHuman(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'AUTH_INVALID' });
  });

  test('requireHuman accepts valid token', () => {
    const token = jwt.sign({ sub: 'user-1', email: 'user@example.com' }, env.JWT_SECRET, {
      expiresIn: '1h'
    });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    requireHuman(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(req.auth).toMatchObject({ role: 'human', id: 'user-1', email: 'user@example.com' });
  });

  test('requireAgent rejects missing credentials', async () => {
    const req: any = { header: () => undefined };
    const next = jest.fn();

    await requireAgent(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'AGENT_AUTH_REQUIRED' });
  });

  test('requireAgent rejects invalid credentials', async () => {
    const apiKeyHash = await bcrypt.hash('real-key', 10);
    const insert = await pool.query(
      'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Auth Agent', 'tester', apiKeyHash]
    );
    const agentId = insert.rows[0].id;

    const req: any = {
      header: (name: string) => {
        if (name === 'x-agent-id') return agentId;
        if (name === 'x-api-key') return 'wrong-key';
        return undefined;
      }
    };
    const next = jest.fn();

    await requireAgent(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'AGENT_AUTH_INVALID' });

    await pool.query('DELETE FROM agents WHERE id = $1', [agentId]);
  });

  test('requireAgent handles database errors as invalid auth', async () => {
    const req: any = {
      header: (name: string) => {
        if (name === 'x-agent-id') return 'not-a-uuid';
        if (name === 'x-api-key') return 'anything';
        return undefined;
      }
    };
    const next = jest.fn();

    await requireAgent(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'AGENT_AUTH_INVALID' });
  });
});
