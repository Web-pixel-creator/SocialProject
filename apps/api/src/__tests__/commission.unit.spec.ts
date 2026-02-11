import type { Pool } from 'pg';
import { CommissionServiceImpl } from '../services/commission/commissionService';

const service = new CommissionServiceImpl(
  {} as Pool,
  { updateImpactOnMerge: jest.fn() } as any,
);

const baseRow = {
  id: 'commission-1',
  user_id: 'user-1',
  description: 'Test commission',
  reference_images: [],
  reward_amount: null,
  currency: 'USD',
  payment_status: 'unpaid',
  status: 'open',
  winner_draft_id: null,
  created_at: new Date().toISOString(),
  completed_at: null,
  escrowed_at: null,
};

describe('commission service error branches', () => {
  test('getCommissionById returns null when commission is missing', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [] })),
    } as any;

    const result = await service.getCommissionById('missing', client);

    expect(result).toBeNull();
  });

  test('getCommissionById returns mapped commission when present', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [baseRow] })),
    } as any;

    const result = await service.getCommissionById('commission-1', client);

    expect(result?.id).toBe('commission-1');
    expect(result?.description).toBe('Test commission');
  });

  test('list commissions applies status filter', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [baseRow] })),
    } as any;

    const result = await service.listCommissions({ status: 'open' }, client);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('status = $1'),
      ['open'],
    );
    expect(result).toHaveLength(1);
  });

  test('list commissions applies forAgents filter', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [baseRow] })),
    } as any;

    await service.listCommissions({ forAgents: true }, client);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('payment_status = $1'),
      ['escrowed'],
    );
  });

  test('selectWinner throws when commission is missing', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [] })),
    } as any;

    await expect(
      service.selectWinner('missing', 'draft-1', 'user-1', client),
    ).rejects.toMatchObject({
      code: 'COMMISSION_NOT_FOUND',
    });
  });

  test('selectWinner throws when user is not owner', async () => {
    const client = {
      query: jest.fn(async () => ({
        rows: [{ ...baseRow, user_id: 'owner-1' }],
      })),
    } as any;

    await expect(
      service.selectWinner('commission-1', 'draft-1', 'user-1', client),
    ).rejects.toMatchObject({
      code: 'COMMISSION_NOT_OWNER',
    });
  });

  test('cancelCommission throws when commission is missing', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [] })),
    } as any;

    await expect(
      service.cancelCommission('missing', 'user-1', client),
    ).rejects.toMatchObject({
      code: 'COMMISSION_NOT_FOUND',
    });
  });

  test('cancelCommission throws when user is not owner', async () => {
    const client = {
      query: jest.fn(async () => ({
        rows: [{ ...baseRow, user_id: 'owner-1' }],
      })),
    } as any;

    await expect(
      service.cancelCommission('commission-1', 'user-1', client),
    ).rejects.toMatchObject({
      code: 'COMMISSION_NOT_OWNER',
    });
  });

  test('cancelCommission throws for invalid status', async () => {
    const client = {
      query: jest.fn(async () => ({
        rows: [{ ...baseRow, status: 'completed' }],
      })),
    } as any;

    await expect(
      service.cancelCommission('commission-1', 'user-1', client),
    ).rejects.toMatchObject({
      code: 'COMMISSION_CANCEL_INVALID',
    });
  });

  test('markEscrowed throws when commission is missing', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [] })),
    } as any;

    await expect(service.markEscrowed('missing', client)).rejects.toMatchObject(
      {
        code: 'COMMISSION_NOT_FOUND',
      },
    );
  });
});
