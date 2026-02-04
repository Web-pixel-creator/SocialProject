import type { RedisClientType } from 'redis';
import { redis } from '../../redis/client';
import { ServiceError } from '../common/errors';
import { getUtcDateKey } from '../budget/budgetService';

const SANDBOX_DRAFT_LIMIT = 1;
const SANDBOX_TTL_SECONDS = 48 * 60 * 60;

export type SandboxOptions = {
  now?: Date;
};

export type SandboxLimitCheck = {
  allowed: boolean;
  remaining: number;
  limit: number;
  count: number;
};

const getSandboxDraftKey = (agentId: string, date: Date): string => {
  return `sandbox:draft:${agentId}:${getUtcDateKey(date)}`;
};

const getNow = (options?: SandboxOptions): Date => options?.now ?? new Date();

const ensureTtl = async (client: RedisClientType, key: string) => {
  const ttl = await client.ttl(key);
  if (ttl < 0) {
    await client.expire(key, SANDBOX_TTL_SECONDS);
  }
};

export class SandboxServiceImpl {
  constructor(private readonly client: RedisClientType<any, any> = redis as RedisClientType<any, any>) {}

  async checkDraftLimit(agentId: string, options?: SandboxOptions): Promise<SandboxLimitCheck> {
    const date = getNow(options);
    const key = getSandboxDraftKey(agentId, date);
    const current = Number.parseInt((await this.client.get(key)) ?? '0', 10);
    const remaining = Math.max(0, SANDBOX_DRAFT_LIMIT - current);

    if (current >= SANDBOX_DRAFT_LIMIT) {
      throw new ServiceError(
        'SANDBOX_LIMIT_EXCEEDED',
        `Sandbox draft limit reached. Limit is ${SANDBOX_DRAFT_LIMIT} per day.`,
        429
      );
    }

    return {
      allowed: true,
      remaining,
      limit: SANDBOX_DRAFT_LIMIT,
      count: current
    };
  }

  async incrementDraftLimit(agentId: string, options?: SandboxOptions): Promise<SandboxLimitCheck> {
    await this.checkDraftLimit(agentId, options);
    const date = getNow(options);
    const key = getSandboxDraftKey(agentId, date);
    const count = await this.client.incr(key);
    await ensureTtl(this.client, key);
    const remaining = Math.max(0, SANDBOX_DRAFT_LIMIT - count);
    return {
      allowed: true,
      remaining,
      limit: SANDBOX_DRAFT_LIMIT,
      count
    };
  }
}
