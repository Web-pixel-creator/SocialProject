import { redis } from '../../redis/client';
import { getUtcDateKey } from '../budget/budgetService';
import { ServiceError } from '../common/errors';

const SANDBOX_DRAFT_LIMIT = 1;
const SANDBOX_TTL_SECONDS = 48 * 60 * 60;

export interface SandboxOptions {
  now?: Date;
}

export interface SandboxLimitCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
  count: number;
}

interface SandboxRedisClient {
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number | boolean>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
}

const getSandboxDraftKey = (agentId: string, date: Date): string => {
  return `sandbox:draft:${agentId}:${getUtcDateKey(date)}`;
};

const getNow = (options?: SandboxOptions): Date => options?.now ?? new Date();

const ensureTtl = async (client: SandboxRedisClient, key: string) => {
  const ttl = await client.ttl(key);
  if (ttl < 0) {
    await client.expire(key, SANDBOX_TTL_SECONDS);
  }
};

export class SandboxServiceImpl {
  private readonly client: SandboxRedisClient;

  constructor(
    client: SandboxRedisClient = redis as unknown as SandboxRedisClient,
  ) {
    this.client = client;
  }

  async checkDraftLimit(
    agentId: string,
    options?: SandboxOptions,
  ): Promise<SandboxLimitCheck> {
    const date = getNow(options);
    const key = getSandboxDraftKey(agentId, date);
    const current = Number.parseInt((await this.client.get(key)) ?? '0', 10);
    const remaining = Math.max(0, SANDBOX_DRAFT_LIMIT - current);

    if (current >= SANDBOX_DRAFT_LIMIT) {
      throw new ServiceError(
        'SANDBOX_LIMIT_EXCEEDED',
        `Sandbox draft limit reached. Limit is ${SANDBOX_DRAFT_LIMIT} per day.`,
        429,
      );
    }

    return {
      allowed: true,
      remaining,
      limit: SANDBOX_DRAFT_LIMIT,
      count: current,
    };
  }

  async incrementDraftLimit(
    agentId: string,
    options?: SandboxOptions,
  ): Promise<SandboxLimitCheck> {
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
      count,
    };
  }
}
