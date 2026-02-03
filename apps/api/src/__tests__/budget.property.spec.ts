import fc from 'fast-check';
import { redis } from '../redis/client';
import {
  ACTION_LIMITS,
  BudgetServiceImpl,
  EDIT_LIMITS,
  getAgentBudgetKey,
  getDraftBudgetKey
} from '../services/budget/budgetService';
import type { BudgetType } from '../services/budget/types';

const service = new BudgetServiceImpl(redis);

const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

describe('budget service properties', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (redis.isOpen) {
      await redis.quit();
    }
  });

  test('Property 6: Edit Budget Limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<BudgetType>('pr', 'major_pr', 'fix_request'),
        fc.uuid(),
        async (type, draftId) => {
          const key = getDraftBudgetKey(draftId, new Date());
          await redis.del(key);

          const limit = EDIT_LIMITS[type];
          for (let i = 0; i < limit; i += 1) {
            await service.incrementEditBudget(draftId, type);
          }

          await expect(service.checkEditBudget(draftId, type)).rejects.toThrow();
          await redis.del(key);
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  test('Property 9: Action Budget Limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<BudgetType>('pr', 'major_pr', 'fix_request'),
        fc.uuid(),
        async (type, agentId) => {
          const key = getAgentBudgetKey(agentId, new Date());
          await redis.del(key);

          const limit = ACTION_LIMITS[type];
          for (let i = 0; i < limit; i += 1) {
            await service.incrementActionBudget(agentId, type);
          }

          await expect(service.checkActionBudget(agentId, type)).rejects.toThrow();
          await redis.del(key);
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  test('Property 8: Daily Budget Reset', async () => {
    const draftId = 'reset-draft';
    const agentId = 'reset-agent';
    const dayOne = new Date(Date.UTC(2026, 0, 1));
    const dayTwo = new Date(Date.UTC(2026, 0, 2));

    const draftKeyDayOne = getDraftBudgetKey(draftId, dayOne);
    const agentKeyDayOne = getAgentBudgetKey(agentId, dayOne);

    await redis.del([draftKeyDayOne, agentKeyDayOne]);

    await service.incrementEditBudget(draftId, 'pr', { now: dayOne });
    await service.incrementActionBudget(agentId, 'pr', { now: dayOne });

    const editDayOne = await service.getEditBudget(draftId, { now: dayOne });
    const editDayTwo = await service.getEditBudget(draftId, { now: dayTwo });

    const actionDayOne = await service.getActionBudget(agentId, { now: dayOne });
    const actionDayTwo = await service.getActionBudget(agentId, { now: dayTwo });

    expect(editDayOne.pr).toBe(1);
    expect(editDayTwo.pr).toBe(0);
    expect(actionDayOne.pr).toBe(1);
    expect(actionDayTwo.pr).toBe(0);

    await redis.del([draftKeyDayOne, agentKeyDayOne]);
  }, 30000);
});
