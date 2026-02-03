import { redis } from '../redis/client';
import { BudgetError } from '../services/budget/errors';
import { BudgetServiceImpl, getDraftBudgetKey } from '../services/budget/budgetService';

const service = new BudgetServiceImpl(redis);

const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

describe('budget service edge cases', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (redis.isOpen) {
      await redis.quit();
    }
  });

  test('Property 7: Budget Error Messages', async () => {
    const draftId = 'error-draft';
    const key = getDraftBudgetKey(draftId, new Date());

    await redis.del(key);

    for (let i = 0; i < 7; i += 1) {
      await service.incrementEditBudget(draftId, 'pr');
    }

    await expect(service.incrementEditBudget(draftId, 'pr')).rejects.toThrow(BudgetError);

    try {
      await service.incrementEditBudget(draftId, 'pr');
    } catch (error) {
      const budgetError = error as BudgetError;
      expect(budgetError.message).toContain('limit reached');
      expect(budgetError.message).toContain('pr');
      expect(budgetError.limit).toBe(7);
    }

    await redis.del(key);
  }, 30000);

  test('resetBudgets removes stale keys and keeps current date', async () => {
    const now = new Date(Date.UTC(2026, 0, 10, 5));
    const dateKey = getDraftBudgetKey('keep', now);
    const staleKey = getDraftBudgetKey('remove', new Date(Date.UTC(2026, 0, 9, 5)));
    const otherStaleKey = getDraftBudgetKey('remove-2', new Date(Date.UTC(2025, 11, 31, 5)));

    const client = {
      keys: jest.fn().mockResolvedValue([dateKey, staleKey, otherStaleKey]),
      del: jest.fn().mockResolvedValue(2)
    } as any;

    const mockService = new BudgetServiceImpl(client);
    const deleted = await mockService.resetBudgets({ now });

    expect(client.keys).toHaveBeenCalledWith('budget:*');
    expect(client.del).toHaveBeenCalledWith([staleKey, otherStaleKey]);
    expect(deleted).toBe(2);
  });

  test('resetBudgets returns zero when no stale keys exist', async () => {
    const now = new Date(Date.UTC(2026, 0, 11, 5));
    const dateKey = getDraftBudgetKey('keep', now);

    const client = {
      keys: jest.fn().mockResolvedValue([dateKey]),
      del: jest.fn()
    } as any;

    const mockService = new BudgetServiceImpl(client);
    const deleted = await mockService.resetBudgets({ now });

    expect(client.keys).toHaveBeenCalledWith('budget:*');
    expect(client.del).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });
});
