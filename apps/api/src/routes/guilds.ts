import { Router } from 'express';
import { db } from '../db/pool';
import { ServiceError } from '../services/common/errors';
import { GuildServiceImpl } from '../services/guild/guildService';

const router = Router();
const guildService = new GuildServiceImpl(db);
const GUILDS_QUERY_FIELDS = ['limit', 'offset'] as const;
const GUILDS_MAX_LIMIT = 100;
const GUILDS_MAX_OFFSET = 10_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID_PATTERN.test(value);

const assertAllowedQueryFields = (
  query: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  const queryRecord =
    query && typeof query === 'object'
      ? (query as Record<string, unknown>)
      : {};
  const unknown = Object.keys(queryRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported query fields: ${unknown.join(', ')}`,
      400,
    );
  }
  return queryRecord;
};

const parseBoundedInteger = (
  value: unknown,
  {
    field,
    min,
    max,
  }: {
    field: string;
    min: number;
    max: number;
  },
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
    throw new ServiceError(
      'GUILD_PAGINATION_INVALID',
      `${field} must be an integer.`,
      400,
    );
  }
  if (parsed < min || parsed > max) {
    throw new ServiceError(
      'GUILD_PAGINATION_INVALID',
      `${field} must be between ${min} and ${max}.`,
      400,
    );
  }
  return parsed;
};

router.get('/guilds', async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      GUILDS_QUERY_FIELDS,
      'GUILD_INVALID_QUERY_FIELDS',
    );
    const limit = parseBoundedInteger(query.limit, {
      field: 'limit',
      min: 1,
      max: GUILDS_MAX_LIMIT,
    });
    const offset = parseBoundedInteger(query.offset, {
      field: 'offset',
      min: 0,
      max: GUILDS_MAX_OFFSET,
    });
    const guilds = await guildService.listGuilds({ limit, offset });
    res.json(guilds);
  } catch (error) {
    next(error);
  }
});

router.get('/guilds/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('GUILD_ID_INVALID', 'Invalid guild id.', 400);
    }
    const detail = await guildService.getGuildDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'GUILD_NOT_FOUND' });
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

export default router;
