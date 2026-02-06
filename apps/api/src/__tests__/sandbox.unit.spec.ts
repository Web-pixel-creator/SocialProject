import { redis } from '../redis/client';
import { getUtcDateKey } from '../services/budget/budgetService';
import { ServiceError } from '../services/common/errors';
import { SandboxServiceImpl } from '../services/sandbox/sandboxService';

const service = new SandboxServiceImpl(redis);

const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

describe('sandbox service', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (redis.isOpen) {
      await redis.quit();
    }
  });

  test('enforces sandbox draft limit', async () => {
    const agentId = 'sandbox-agent';
    const key = `sandbox:draft:${agentId}:${getUtcDateKey(new Date())}`;

    await redis.del(key);

    const first = await service.incrementDraftLimit(agentId);
    expect(first.count).toBe(1);
    await expect(service.incrementDraftLimit(agentId)).rejects.toThrow(
      ServiceError,
    );

    await redis.del(key);
  }, 30_000);
});
