import { redis } from '../../redis/client';
import { BudgetError } from './errors';
import type {
  BudgetCheck,
  BudgetCounts,
  BudgetOptions,
  BudgetService,
  BudgetType,
} from './types';

export const EDIT_LIMITS: Record<BudgetType, number> = {
  pr: 7,
  major_pr: 3,
  fix_request: 3,
};

export const ACTION_LIMITS: Record<BudgetType, number> = {
  pr: 10,
  major_pr: 3,
  fix_request: 5,
};

const FIELD_BY_TYPE: Record<BudgetType, string> = {
  pr: 'prCount',
  major_pr: 'majorPrCount',
  fix_request: 'fixRequestCount',
};

const BUDGET_TTL_SECONDS = 48 * 60 * 60;

interface BudgetRedisClient {
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number | boolean>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, increment: number): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  del(keys: string[]): Promise<number>;
}

export const getUtcDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDraftBudgetKey = (draftId: string, date: Date): string => {
  return `budget:draft:${draftId}:${getUtcDateKey(date)}`;
};

export const getAgentBudgetKey = (agentId: string, date: Date): string => {
  return `budget:agent:${agentId}:${getUtcDateKey(date)}`;
};

const ensureTtl = async (client: BudgetRedisClient, key: string) => {
  const ttl = await client.ttl(key);
  if (ttl < 0) {
    await client.expire(key, BUDGET_TTL_SECONDS);
  }
};

const toCounts = (data: Record<string, string>): BudgetCounts => {
  return {
    pr: Number.parseInt(data.prCount ?? '0', 10),
    major_pr: Number.parseInt(data.majorPrCount ?? '0', 10),
    fix_request: Number.parseInt(data.fixRequestCount ?? '0', 10),
  };
};

const getNow = (options?: BudgetOptions): Date => options?.now ?? new Date();

export class BudgetServiceImpl implements BudgetService {
  constructor(
    private readonly client: BudgetRedisClient = redis as unknown as BudgetRedisClient,
  ) {}

  async checkEditBudget(
    draftId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCheck> {
    return this.checkBudget('draft', draftId, type, options);
  }

  async incrementEditBudget(
    draftId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCounts> {
    return this.incrementBudget('draft', draftId, type, options);
  }

  async checkActionBudget(
    agentId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCheck> {
    return this.checkBudget('agent', agentId, type, options);
  }

  async incrementActionBudget(
    agentId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCounts> {
    return this.incrementBudget('agent', agentId, type, options);
  }

  async getEditBudget(
    draftId: string,
    options?: BudgetOptions,
  ): Promise<BudgetCounts> {
    const key = getDraftBudgetKey(draftId, getNow(options));
    const data = await this.client.hGetAll(key);
    return toCounts(data);
  }

  async getActionBudget(
    agentId: string,
    options?: BudgetOptions,
  ): Promise<BudgetCounts> {
    const key = getAgentBudgetKey(agentId, getNow(options));
    const data = await this.client.hGetAll(key);
    return toCounts(data);
  }

  async resetBudgets(options?: BudgetOptions): Promise<number> {
    const dateKey = getUtcDateKey(getNow(options));
    const keys = await this.client.keys('budget:*');
    const toDelete = keys.filter((key) => !key.endsWith(dateKey));
    if (toDelete.length === 0) {
      return 0;
    }
    await this.client.del(toDelete);
    return toDelete.length;
  }

  private async checkBudget(
    scope: 'draft' | 'agent',
    id: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCheck> {
    const date = getNow(options);
    const key =
      scope === 'draft'
        ? getDraftBudgetKey(id, date)
        : getAgentBudgetKey(id, date);
    const limits = scope === 'draft' ? EDIT_LIMITS : ACTION_LIMITS;

    const data = await this.client.hGetAll(key);
    const counts = toCounts(data);
    const current = counts[type];
    const limit = limits[type];
    const remaining = Math.max(0, limit - current);

    if (current >= limit) {
      const code =
        scope === 'draft' ? 'EDIT_BUDGET_EXCEEDED' : 'ACTION_BUDGET_EXCEEDED';
      const label = scope === 'draft' ? 'edit' : 'action';
      throw new BudgetError(
        code,
        `Daily ${label} budget limit reached for ${type}. Limit is ${limit} per day.`,
        limit,
        type,
      );
    }

    return {
      allowed: true,
      remaining,
      limit,
    };
  }

  private async incrementBudget(
    scope: 'draft' | 'agent',
    id: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCounts> {
    const date = getNow(options);
    const key =
      scope === 'draft'
        ? getDraftBudgetKey(id, date)
        : getAgentBudgetKey(id, date);

    await this.checkBudget(scope, id, type, options);

    await this.client.hIncrBy(key, FIELD_BY_TYPE[type], 1);
    await ensureTtl(this.client, key);

    const data = await this.client.hGetAll(key);
    return toCounts(data);
  }
}
