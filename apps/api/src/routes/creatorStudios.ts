import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { ServiceError } from '../services/common/errors';
import { CreatorStudioServiceImpl } from '../services/creatorStudio/creatorStudioService';
import type {
  CreateCreatorStudioInput,
  CreatorStudioStatus,
  UpdateCreatorGovernanceInput,
} from '../services/creatorStudio/types';

const router = Router();
const creatorStudioService = new CreatorStudioServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STUDIO_STATUSES: CreatorStudioStatus[] = ['draft', 'active', 'paused'];
const STYLE_PRESETS = ['balanced', 'bold', 'minimal', 'experimental'] as const;
const MODERATION_MODES = ['strict', 'balanced', 'open'] as const;
const CREATOR_STUDIOS_QUERY_FIELDS = ['status', 'limit', 'offset'] as const;
const CREATOR_STUDIOS_FUNNEL_QUERY_FIELDS = ['windowDays'] as const;
const CREATOR_STUDIO_DETAIL_QUERY_FIELDS = [] as const;
const CREATOR_STUDIO_CREATE_QUERY_FIELDS = [] as const;
const CREATOR_STUDIO_CREATE_BODY_FIELDS = [
  'studioName',
  'tagline',
  'stylePreset',
  'revenueSharePercent',
] as const;
const CREATOR_STUDIO_GOVERNANCE_QUERY_FIELDS = [] as const;
const CREATOR_STUDIO_GOVERNANCE_BODY_FIELDS = [
  'governance',
  'revenueSharePercent',
] as const;
const CREATOR_STUDIO_GOVERNANCE_FIELDS = [
  'autoApproveThreshold',
  'majorPrRequiresHuman',
  'allowForks',
  'moderationMode',
] as const;
const CREATOR_STUDIO_BILLING_QUERY_FIELDS = [] as const;
const CREATOR_STUDIO_BILLING_BODY_FIELDS = ['providerAccountId'] as const;
const CREATOR_STUDIO_RETENTION_QUERY_FIELDS = [] as const;
const CREATOR_STUDIO_RETENTION_BODY_FIELDS = [] as const;
const CREATOR_STUDIOS_MAX_LIMIT = 100;
const CREATOR_STUDIOS_MAX_OFFSET = 10_000;
const CREATOR_STUDIOS_MAX_WINDOW_DAYS = 365;
const CREATOR_STUDIO_NAME_MAX_LENGTH = 120;
const CREATOR_STUDIO_TAGLINE_MAX_LENGTH = 220;
const CREATOR_STUDIO_PROVIDER_ACCOUNT_MAX_LENGTH = 160;
const isUuid = (value: string) => UUID_PATTERN.test(value);

const assertCreatorStudioIdParam = (value: string) => {
  if (!isUuid(value)) {
    throw new ServiceError(
      'CREATOR_STUDIO_ID_INVALID',
      'Invalid creator studio id.',
      400,
    );
  }
};

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

const assertAllowedBodyFields = (
  body: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  if (body === undefined) {
    return {};
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ServiceError(errorCode, 'Request body must be an object.', 400);
  }
  const bodyRecord = body as Record<string, unknown>;
  const unknown = Object.keys(bodyRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported body fields: ${unknown.join(', ')}`,
      400,
    );
  }
  return bodyRecord;
};

const parseRequiredBoundedText = (
  value: unknown,
  {
    field,
    maxLength,
    errorCode,
  }: {
    field: string;
    maxLength: number;
    errorCode: string;
  },
) => {
  if (typeof value !== 'string') {
    throw new ServiceError(errorCode, `${field} must be a string.`, 400);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new ServiceError(errorCode, `${field} is required.`, 400);
  }
  if (normalized.length > maxLength) {
    throw new ServiceError(
      errorCode,
      `${field} must be <= ${maxLength} characters.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalBoundedText = (
  value: unknown,
  {
    field,
    maxLength,
    errorCode,
  }: {
    field: string;
    maxLength: number;
    errorCode: string;
  },
) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(errorCode, `${field} must be a string.`, 400);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maxLength) {
    throw new ServiceError(
      errorCode,
      `${field} must be <= ${maxLength} characters.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalBoolean = (
  value: unknown,
  {
    field,
    errorCode,
  }: {
    field: string;
    errorCode: string;
  },
) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new ServiceError(errorCode, `${field} must be a boolean.`, 400);
  }
  return value;
};

const parseOptionalBoundedNumber = (
  value: unknown,
  {
    field,
    min,
    max,
    errorCode,
  }: {
    field: string;
    min: number;
    max: number;
    errorCode: string;
  },
) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ServiceError(errorCode, `${field} must be a number.`, 400);
  }
  if (value < min || value > max) {
    throw new ServiceError(
      errorCode,
      `${field} must be between ${min} and ${max}.`,
      400,
    );
  }
  return value;
};

const parseCreatorStudioStatus = (
  value: unknown,
): CreatorStudioStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'INVALID_CREATOR_STUDIO_STATUS',
      'status must be a string.',
      400,
    );
  }
  const normalized = value.trim() as CreatorStudioStatus;
  if (!STUDIO_STATUSES.includes(normalized)) {
    throw new ServiceError(
      'INVALID_CREATOR_STUDIO_STATUS',
      `status must be one of: ${STUDIO_STATUSES.join(', ')}.`,
      400,
    );
  }
  return normalized;
};

const parseStylePreset = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_STYLE_PRESET',
      'stylePreset must be a string.',
      400,
    );
  }
  const normalized = value.trim() as (typeof STYLE_PRESETS)[number];
  if (!STYLE_PRESETS.includes(normalized)) {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_STYLE_PRESET',
      `stylePreset must be one of: ${STYLE_PRESETS.join(', ')}.`,
      400,
    );
  }
  return normalized;
};

const parseModerationMode = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_MODERATION_MODE',
      'moderationMode must be a string.',
      400,
    );
  }
  const normalized = value.trim() as (typeof MODERATION_MODES)[number];
  if (!MODERATION_MODES.includes(normalized)) {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_MODERATION_MODE',
      `moderationMode must be one of: ${MODERATION_MODES.join(', ')}.`,
      400,
    );
  }
  return normalized;
};

const parseCreateCreatorStudioInput = (
  body: Record<string, unknown>,
): CreateCreatorStudioInput => ({
  studioName: parseRequiredBoundedText(body.studioName, {
    field: 'studioName',
    maxLength: CREATOR_STUDIO_NAME_MAX_LENGTH,
    errorCode: 'CREATOR_STUDIO_INVALID_INPUT',
  }),
  tagline: parseOptionalBoundedText(body.tagline, {
    field: 'tagline',
    maxLength: CREATOR_STUDIO_TAGLINE_MAX_LENGTH,
    errorCode: 'CREATOR_STUDIO_INVALID_INPUT',
  }),
  stylePreset: parseStylePreset(body.stylePreset),
  revenueSharePercent: parseOptionalBoundedNumber(body.revenueSharePercent, {
    field: 'revenueSharePercent',
    min: 0,
    max: 100,
    errorCode: 'CREATOR_STUDIO_INVALID_REVENUE_SHARE',
  }),
});

const parseGovernancePatch = (
  value: unknown,
): NonNullable<UpdateCreatorGovernanceInput['governance']> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_INPUT',
      'governance must be an object.',
      400,
    );
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter(
    (key) =>
      !CREATOR_STUDIO_GOVERNANCE_FIELDS.includes(
        key as (typeof CREATOR_STUDIO_GOVERNANCE_FIELDS)[number],
      ),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_INPUT',
      `Unsupported governance fields: ${unknown.join(', ')}`,
      400,
    );
  }
  const patch: NonNullable<UpdateCreatorGovernanceInput['governance']> = {};
  const autoApproveThreshold = parseOptionalBoundedNumber(
    record.autoApproveThreshold,
    {
      field: 'governance.autoApproveThreshold',
      min: 0,
      max: 1,
      errorCode: 'CREATOR_STUDIO_INVALID_THRESHOLD',
    },
  );
  if (autoApproveThreshold !== undefined) {
    patch.autoApproveThreshold = autoApproveThreshold;
  }
  const majorPrRequiresHuman = parseOptionalBoolean(
    record.majorPrRequiresHuman,
    {
      field: 'governance.majorPrRequiresHuman',
      errorCode: 'CREATOR_STUDIO_INVALID_INPUT',
    },
  );
  if (majorPrRequiresHuman !== undefined) {
    patch.majorPrRequiresHuman = majorPrRequiresHuman;
  }
  const allowForks = parseOptionalBoolean(record.allowForks, {
    field: 'governance.allowForks',
    errorCode: 'CREATOR_STUDIO_INVALID_INPUT',
  });
  if (allowForks !== undefined) {
    patch.allowForks = allowForks;
  }
  const moderationMode = parseModerationMode(record.moderationMode);
  if (moderationMode !== undefined) {
    patch.moderationMode = moderationMode;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
};

const parseUpdateCreatorGovernanceInput = (
  body: Record<string, unknown>,
): UpdateCreatorGovernanceInput => ({
  governance: parseGovernancePatch(body.governance),
  revenueSharePercent: parseOptionalBoundedNumber(body.revenueSharePercent, {
    field: 'revenueSharePercent',
    min: 0,
    max: 100,
    errorCode: 'CREATOR_STUDIO_INVALID_REVENUE_SHARE',
  }),
});

const parseBoundedInteger = (
  value: unknown,
  {
    field,
    min,
    max,
    errorCode,
  }: {
    field: string;
    min: number;
    max: number;
    errorCode: string;
  },
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(errorCode, `${field} must be an integer.`, 400);
    }
    [normalized] = normalized;
  }
  const parsed = Number(normalized);
  if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
    throw new ServiceError(errorCode, `${field} must be an integer.`, 400);
  }
  if (parsed < min || parsed > max) {
    throw new ServiceError(
      errorCode,
      `${field} must be between ${min} and ${max}.`,
      400,
    );
  }
  return parsed;
};

router.get(
  '/creator-studios/funnels/summary',
  requireHuman,
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(
        req.query,
        CREATOR_STUDIOS_FUNNEL_QUERY_FIELDS,
        'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
      );
      const windowDays = parseBoundedInteger(query.windowDays, {
        field: 'windowDays',
        min: 1,
        max: CREATOR_STUDIOS_MAX_WINDOW_DAYS,
        errorCode: 'INVALID_WINDOW_DAYS',
      });

      const ownerUserId = req.auth?.id as string;
      const summary = await creatorStudioService.getFunnelSummary(
        ownerUserId,
        windowDays,
      );
      res.json(summary);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/creator-studios/mine', requireHuman, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      CREATOR_STUDIOS_QUERY_FIELDS,
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );
    const status = parseCreatorStudioStatus(query.status);
    const limit = parseBoundedInteger(query.limit, {
      field: 'limit',
      min: 1,
      max: CREATOR_STUDIOS_MAX_LIMIT,
      errorCode: 'INVALID_LIMIT',
    });
    const offset = parseBoundedInteger(query.offset, {
      field: 'offset',
      min: 0,
      max: CREATOR_STUDIOS_MAX_OFFSET,
      errorCode: 'INVALID_OFFSET',
    });

    const ownerUserId = req.auth?.id as string;
    const studios = await creatorStudioService.listStudios({
      status,
      limit,
      offset,
      ownerUserId,
    });
    res.json(studios);
  } catch (error) {
    next(error);
  }
});

router.get('/creator-studios', async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      CREATOR_STUDIOS_QUERY_FIELDS,
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );
    const status = parseCreatorStudioStatus(query.status);
    const limit = parseBoundedInteger(query.limit, {
      field: 'limit',
      min: 1,
      max: CREATOR_STUDIOS_MAX_LIMIT,
      errorCode: 'INVALID_LIMIT',
    });
    const offset = parseBoundedInteger(query.offset, {
      field: 'offset',
      min: 0,
      max: CREATOR_STUDIOS_MAX_OFFSET,
      errorCode: 'INVALID_OFFSET',
    });

    const studios = await creatorStudioService.listStudios({
      status,
      limit,
      offset,
    });
    res.json(studios);
  } catch (error) {
    next(error);
  }
});

router.get('/creator-studios/:id', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      CREATOR_STUDIO_DETAIL_QUERY_FIELDS,
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );
    assertCreatorStudioIdParam(req.params.id);
    const studio = await creatorStudioService.getStudio(req.params.id);
    if (!studio) {
      return res.status(404).json({ error: 'CREATOR_STUDIO_NOT_FOUND' });
    }
    res.json(studio);
  } catch (error) {
    next(error);
  }
});

router.post('/creator-studios', requireHuman, async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      CREATOR_STUDIO_CREATE_QUERY_FIELDS,
      'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
    );
    const payload = assertAllowedBodyFields(
      req.body,
      CREATOR_STUDIO_CREATE_BODY_FIELDS,
      'CREATOR_STUDIO_INVALID_FIELDS',
    );
    const input = parseCreateCreatorStudioInput(payload);
    const studio = await creatorStudioService.createStudio(
      req.auth?.id as string,
      input,
    );
    res.status(201).json(studio);
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/creator-studios/:id/governance',
  requireHuman,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        CREATOR_STUDIO_GOVERNANCE_QUERY_FIELDS,
        'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
      );
      assertCreatorStudioIdParam(req.params.id);
      const payload = assertAllowedBodyFields(
        req.body,
        CREATOR_STUDIO_GOVERNANCE_BODY_FIELDS,
        'CREATOR_STUDIO_GOVERNANCE_INVALID_FIELDS',
      );
      const input = parseUpdateCreatorGovernanceInput(payload);
      const studio = await creatorStudioService.updateGovernance(
        req.params.id,
        req.auth?.id as string,
        input,
      );
      res.json(studio);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/creator-studios/:id/billing/connect',
  requireHuman,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        CREATOR_STUDIO_BILLING_QUERY_FIELDS,
        'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
      );
      assertCreatorStudioIdParam(req.params.id);
      const payload = assertAllowedBodyFields(
        req.body,
        CREATOR_STUDIO_BILLING_BODY_FIELDS,
        'CREATOR_STUDIO_BILLING_INVALID_FIELDS',
      );
      const providerAccountId = parseOptionalBoundedText(
        payload.providerAccountId,
        {
          field: 'providerAccountId',
          maxLength: CREATOR_STUDIO_PROVIDER_ACCOUNT_MAX_LENGTH,
          errorCode: 'CREATOR_STUDIO_INVALID_INPUT',
        },
      );
      const studio = await creatorStudioService.connectBilling(
        req.params.id,
        req.auth?.id as string,
        providerAccountId,
      );
      res.json(studio);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/creator-studios/:id/retention/ping',
  requireHuman,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        CREATOR_STUDIO_RETENTION_QUERY_FIELDS,
        'CREATOR_STUDIO_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        CREATOR_STUDIO_RETENTION_BODY_FIELDS,
        'CREATOR_STUDIO_RETENTION_INVALID_FIELDS',
      );
      assertCreatorStudioIdParam(req.params.id);
      const studio = await creatorStudioService.retentionPing(
        req.params.id,
        req.auth?.id as string,
      );
      res.json(studio);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
