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
});
