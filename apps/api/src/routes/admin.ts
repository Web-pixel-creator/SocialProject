import type { Request } from 'express';
import { Router } from 'express';
import { env } from '../config/env';
import { db } from '../db/pool';
import { requireAdmin } from '../middleware/admin';
import { redis } from '../redis/client';
import { agentGatewayService } from '../services/agentGateway/agentGatewayService';
import type {
  AgentGatewaySessionDetail,
  AgentGatewaySessionStatus,
} from '../services/agentGateway/types';
import { parseConnectorPolicyMap } from '../services/agentGatewayIngest/connectorPolicy';
import { aiRuntimeService } from '../services/aiRuntime/aiRuntimeService';
import type { AIRuntimeRole } from '../services/aiRuntime/types';
import {
  ACTION_LIMITS,
  BudgetServiceImpl,
  EDIT_LIMITS,
  getUtcDateKey,
} from '../services/budget/budgetService';
import { ServiceError } from '../services/common/errors';
import { draftOrchestrationService } from '../services/orchestration/draftOrchestrationService';
import { PrivacyServiceImpl } from '../services/privacy/privacyService';
import type { RealtimeService } from '../services/realtime/types';
import { EmbeddingBackfillServiceImpl } from '../services/search/embeddingBackfillService';

const router = Router();
const embeddingBackfillService = new EmbeddingBackfillServiceImpl(db);
const budgetService = new BudgetServiceImpl();
const privacyService = new PrivacyServiceImpl(db);
const AGENT_GATEWAY_CONNECTOR_POLICY_MAP = parseConnectorPolicyMap(
  env.AGENT_GATEWAY_INGEST_CONNECTOR_POLICIES,
);

const toNumber = (value: string | number | undefined, fallback = 0) =>
  typeof value === 'number'
    ? value
    : Number.parseInt(value ?? `${fallback}`, 10);
const toRate = (numerator: number, denominator: number) =>
  denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;
const toNullableIsoTimestamp = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  }
  return null;
};
const PREDICTION_RESOLUTION_WINDOW_THRESHOLDS = {
  accuracyRate: {
    criticalBelow: 0.45,
    watchBelow: 0.6,
  },
  minResolvedPredictions: 3,
} as const;

const resolveHealthLevel = (
  value: number | null,
  {
    criticalBelow,
    watchBelow,
  }: {
    criticalBelow: number;
    watchBelow: number;
  },
) => {
  if (!(typeof value === 'number' && Number.isFinite(value))) {
    return 'unknown';
  }
  if (value < criticalBelow) {
    return 'critical';
  }
  if (value < watchBelow) {
    return 'watch';
  }
  return 'healthy';
};

const RUNTIME_ROLES: AIRuntimeRole[] = ['author', 'critic', 'maker', 'judge'];
const AI_RUNTIME_DRY_RUN_ALLOWED_FIELDS = new Set([
  'role',
  'prompt',
  'providersOverride',
  'simulateFailures',
  'timeoutMs',
]);
const AI_RUNTIME_DRY_RUN_MAX_ARRAY_ITEMS = 10;
const AI_RUNTIME_DRY_RUN_MAX_ARRAY_ITEM_LENGTH = 64;
const AI_RUNTIME_DRY_RUN_MAX_PROMPT_LENGTH = 4000;
const AI_RUNTIME_DRY_RUN_MAX_TIMEOUT_MS = 120_000;
const AI_RUNTIME_PROVIDER_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const AGENT_GATEWAY_MAX_KEEP_RECENT = 299;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENT_GATEWAY_SESSION_ID_PATTERN = /^ags-[a-z0-9][a-z0-9-]{7,95}$/;
const AGENT_GATEWAY_CHANNEL_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
const AGENT_GATEWAY_EXTERNAL_SESSION_ID_PATTERN =
  /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const AGENT_GATEWAY_ROLE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const AGENT_GATEWAY_EVENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const AGENT_GATEWAY_CONNECTOR_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
const ADMIN_UX_EVENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const ADMIN_ERROR_CODE_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,119}$/i;
const ADMIN_ERROR_ROUTE_PATTERN = /^\/[a-z0-9/_:.-]{0,239}$/i;

const parseBoundedQueryInt = (
  value: unknown,
  {
    fieldName,
    defaultValue,
    min,
    max,
  }: {
    fieldName: string;
    defaultValue: number;
    min: number;
    max: number;
  },
): number => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(
        'ADMIN_INVALID_QUERY',
        `${fieldName} must be a single integer between ${min} and ${max}.`,
        400,
      );
    }
    [normalized] = normalized;
  }

  let parsed = Number.NaN;
  if (typeof normalized === 'number') {
    parsed = normalized;
  } else if (typeof normalized === 'string') {
    parsed = Number(normalized.trim());
  }

  if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must be an integer between ${min} and ${max}.`,
      400,
    );
  }

  if (parsed < min || parsed > max) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must be between ${min} and ${max}.`,
      400,
    );
  }

  return parsed;
};

const assertAllowedQueryFields = (
  query: unknown,
  {
    allowed,
    endpoint,
  }: {
    allowed: readonly string[];
    endpoint: string;
  },
): Record<string, unknown> => {
  const queryRecord =
    typeof query === 'object' && query !== null
      ? (query as Record<string, unknown>)
      : {};
  const allowedSet = new Set(allowed);
  const unsupported = Object.keys(queryRecord).filter(
    (key) => !allowedSet.has(key),
  );
  if (unsupported.length > 0) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `Unsupported query fields for ${endpoint}: ${unsupported.join(', ')}.`,
      400,
    );
  }
  return queryRecord;
};

const assertAllowedBodyFields = (
  body: unknown,
  {
    allowed,
    endpoint,
  }: {
    allowed: readonly string[];
    endpoint: string;
  },
): Record<string, unknown> => {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `Body for ${endpoint} must be a JSON object.`,
      400,
    );
  }

  const bodyRecord = body as Record<string, unknown>;
  const allowedSet = new Set(allowed);
  const unsupported = Object.keys(bodyRecord).filter(
    (key) => !allowedSet.has(key),
  );
  if (unsupported.length > 0) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `Unsupported body fields for ${endpoint}: ${unsupported.join(', ')}.`,
      400,
    );
  }
  return bodyRecord;
};

const parseBoundedOptionalInt = (
  value: unknown,
  {
    fieldName,
    min,
    max,
    invalidCode = 'ADMIN_INVALID_QUERY',
  }: {
    fieldName: string;
    min: number;
    max: number;
    invalidCode?: string;
  },
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(
        invalidCode,
        `${fieldName} must be a single integer between ${min} and ${max}.`,
        400,
      );
    }
    [normalized] = normalized;
  }

  let parsed = Number.NaN;
  if (typeof normalized === 'number') {
    parsed = normalized;
  } else if (typeof normalized === 'string') {
    parsed = Number(normalized.trim());
  }

  if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
    throw new ServiceError(
      invalidCode,
      `${fieldName} must be an integer between ${min} and ${max}.`,
      400,
    );
  }
  if (parsed < min || parsed > max) {
    throw new ServiceError(
      invalidCode,
      `${fieldName} must be between ${min} and ${max}.`,
      400,
    );
  }

  return parsed;
};

const parseOptionalBooleanFlag = (
  value: unknown,
  {
    fieldName,
    invalidCode,
  }: {
    fieldName: string;
    invalidCode: string;
  },
): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(
        invalidCode,
        `${fieldName} must be a single boolean value.`,
        400,
      );
    }
    [normalized] = normalized;
  }

  if (typeof normalized === 'boolean') {
    return normalized;
  }
  if (typeof normalized !== 'string') {
    throw new ServiceError(
      invalidCode,
      `${fieldName} must be a boolean value.`,
      400,
    );
  }

  const lowered = normalized.trim().toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }

  throw new ServiceError(
    invalidCode,
    `${fieldName} must be true or false.`,
    400,
  );
};

const parseAgentGatewaySourceQuery = (value: unknown): 'db' | 'memory' => {
  if (value === undefined || value === null || value === '') {
    return 'db';
  }

  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(
        'ADMIN_INVALID_QUERY',
        "source must be either 'db' or 'memory'.",
        400,
      );
    }
    [normalized] = normalized;
  }

  if (typeof normalized !== 'string') {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      "source must be either 'db' or 'memory'.",
      400,
    );
  }

  const source = normalized.trim().toLowerCase();
  if (source === '' || source === 'db') {
    return 'db';
  }
  if (source === 'memory') {
    return 'memory';
  }

  throw new ServiceError(
    'ADMIN_INVALID_QUERY',
    "source must be either 'db' or 'memory'.",
    400,
  );
};

const parseAgentGatewaySessionIdParam = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new ServiceError(
      'ADMIN_INVALID_SESSION_ID',
      'sessionId must be a valid agent gateway session id.',
      400,
    );
  }

  const normalized = value.trim().toLowerCase();
  if (!AGENT_GATEWAY_SESSION_ID_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_SESSION_ID',
      'sessionId must be a valid agent gateway session id.',
      400,
    );
  }

  return normalized;
};

const parseOptionalBoundedQueryString = (
  value: unknown,
  {
    fieldName,
    maxLength,
  }: {
    fieldName: string;
    maxLength: number;
  },
): string | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(
        'ADMIN_INVALID_QUERY',
        `${fieldName} must be a single string value.`,
        400,
      );
    }
    [normalized] = normalized;
  }

  if (typeof normalized !== 'string') {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must be a string value.`,
      400,
    );
  }

  const trimmed = normalized.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must be at most ${maxLength} characters.`,
      400,
    );
  }

  return trimmed;
};

const parseOptionalUuidQueryString = (
  value: unknown,
  {
    fieldName,
    invalidCode = 'ADMIN_INVALID_QUERY',
  }: {
    fieldName: string;
    invalidCode?: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return null;
  }
  if (!UUID_PATTERN.test(parsed)) {
    throw new ServiceError(invalidCode, `${fieldName} must be a UUID.`, 400);
  }
  return parsed.toLowerCase();
};

const parseOptionalUxEventTypeQueryString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 120,
  });
  if (!parsed) {
    return null;
  }
  const normalized = parsed.toLowerCase();
  if (!ADMIN_UX_EVENT_TYPE_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use a valid event type format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalErrorCodeQueryString = (
  value: unknown,
  {
    fieldName,
    maxLength,
  }: {
    fieldName: string;
    maxLength: number;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength,
  });
  if (!parsed) {
    return null;
  }
  if (!ADMIN_ERROR_CODE_PATTERN.test(parsed)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use a valid error-code format.`,
      400,
    );
  }
  return parsed;
};

const parseOptionalErrorRouteQueryString = (
  value: unknown,
  {
    fieldName,
    maxLength,
  }: {
    fieldName: string;
    maxLength: number;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength,
  });
  if (!parsed) {
    return null;
  }
  if (!ADMIN_ERROR_ROUTE_PATTERN.test(parsed)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use a valid route format.`,
      400,
    );
  }
  return parsed;
};

const parseOptionalGatewayChannelQueryString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return null;
  }
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_CHANNEL_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use a valid channel format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalProviderIdentifierQueryString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return null;
  }
  const normalized = parsed.toLowerCase();
  if (!AI_RUNTIME_PROVIDER_IDENTIFIER_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use provider identifier format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalGatewaySessionStatusQuery = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): AgentGatewaySessionStatus | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 16,
  });
  if (!parsed) {
    return null;
  }
  const normalized = parsed.toLowerCase();
  if (normalized === 'active' || normalized === 'closed') {
    return normalized;
  }
  throw new ServiceError(
    'ADMIN_INVALID_QUERY',
    `${fieldName} must be either "active" or "closed".`,
    400,
  );
};

const parseOptionalGatewayRoleQueryString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return null;
  }
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_ROLE_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use a valid role format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalGatewayEventTypeQueryString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 120,
  });
  if (!parsed) {
    return null;
  }
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_EVENT_TYPE_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use a valid event type format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalGatewayEventQueryString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 160,
  });
  if (!parsed) {
    return null;
  }
  return parsed.toLowerCase();
};

const parseOptionalGatewayConnectorIdQueryString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | null => {
  const parsed = parseOptionalBoundedQueryString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return null;
  }
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_CONNECTOR_ID_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_QUERY',
      `${fieldName} must use a valid connector id format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalBoundedBodyString = (
  value: unknown,
  {
    fieldName,
    maxLength,
  }: {
    fieldName: string;
    maxLength: number;
  },
): string | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  let normalized: unknown = value;
  if (Array.isArray(normalized)) {
    if (normalized.length !== 1) {
      throw new ServiceError(
        'ADMIN_INVALID_BODY',
        `${fieldName} must be a single string value.`,
        400,
      );
    }
    [normalized] = normalized;
  }

  if (typeof normalized !== 'string') {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must be a string value.`,
      400,
    );
  }

  const trimmed = normalized.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must be at most ${maxLength} characters.`,
      400,
    );
  }

  return trimmed;
};

const parseRequiredBoundedBodyString = (
  value: unknown,
  {
    fieldName,
    maxLength,
  }: {
    fieldName: string;
    maxLength: number;
  },
): string => {
  const parsed = parseOptionalBoundedBodyString(value, {
    fieldName,
    maxLength,
  });
  if (!parsed) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} is required.`,
      400,
    );
  }
  return parsed;
};

const parseRequiredUuidBodyString = (
  value: unknown,
  {
    fieldName,
    invalidCode = 'ADMIN_INVALID_BODY',
  }: {
    fieldName: string;
    invalidCode?: string;
  },
): string => {
  const parsed = parseRequiredBoundedBodyString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!UUID_PATTERN.test(parsed)) {
    throw new ServiceError(invalidCode, `${fieldName} must be a UUID.`, 400);
  }
  return parsed.toLowerCase();
};

const parseOptionalUuidBodyString = (
  value: unknown,
  {
    fieldName,
    invalidCode = 'ADMIN_INVALID_BODY',
  }: {
    fieldName: string;
    invalidCode?: string;
  },
): string | undefined => {
  const parsed = parseOptionalBoundedBodyString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return undefined;
  }
  if (!UUID_PATTERN.test(parsed)) {
    throw new ServiceError(invalidCode, `${fieldName} must be a UUID.`, 400);
  }
  return parsed.toLowerCase();
};

const parseRequiredGatewayChannelBodyString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string => {
  const parsed = parseRequiredBoundedBodyString(value, {
    fieldName,
    maxLength: 64,
  });
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_CHANNEL_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must use a valid channel format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalGatewayChannelBodyString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | undefined => {
  const parsed = parseOptionalBoundedBodyString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return undefined;
  }
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_CHANNEL_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must use a valid channel format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalGatewayExternalSessionIdBodyString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | undefined => {
  const parsed = parseOptionalBoundedBodyString(value, {
    fieldName,
    maxLength: 128,
  });
  if (!parsed) {
    return undefined;
  }
  if (!AGENT_GATEWAY_EXTERNAL_SESSION_ID_PATTERN.test(parsed)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must use a valid external session id format.`,
      400,
    );
  }
  return parsed;
};

const parseRequiredGatewayRoleBodyString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string => {
  const parsed = parseRequiredBoundedBodyString(value, {
    fieldName,
    maxLength: 64,
  });
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_ROLE_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must use a valid role format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalGatewayRoleBodyString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string | undefined => {
  const parsed = parseOptionalBoundedBodyString(value, {
    fieldName,
    maxLength: 64,
  });
  if (!parsed) {
    return undefined;
  }
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_ROLE_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must use a valid role format.`,
      400,
    );
  }
  return normalized;
};

const parseRequiredGatewayEventTypeBodyString = (
  value: unknown,
  {
    fieldName,
  }: {
    fieldName: string;
  },
): string => {
  const parsed = parseRequiredBoundedBodyString(value, {
    fieldName,
    maxLength: 120,
  });
  const normalized = parsed.toLowerCase();
  if (!AGENT_GATEWAY_EVENT_TYPE_PATTERN.test(normalized)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must use a valid event type format.`,
      400,
    );
  }
  return normalized;
};

const parseOptionalStringArrayBody = (
  value: unknown,
  {
    fieldName,
    maxItems = 20,
    maxItemLength = 64,
  }: {
    fieldName: string;
    maxItems?: number;
    maxItemLength?: number;
  },
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must be an array of strings.`,
      400,
    );
  }
  if (value.length > maxItems) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} supports up to ${maxItems} items.`,
      400,
    );
  }

  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ServiceError(
        'ADMIN_INVALID_BODY',
        `${fieldName} must contain strings only.`,
        400,
      );
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.length > maxItemLength) {
      throw new ServiceError(
        'ADMIN_INVALID_BODY',
        `${fieldName} items must be at most ${maxItemLength} characters.`,
        400,
      );
    }
    normalized.push(trimmed);
  }

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
};

const parseOptionalGatewayRolesBody = (
  value: unknown,
  {
    fieldName,
    maxItems = 20,
    maxItemLength = 64,
  }: {
    fieldName: string;
    maxItems?: number;
    maxItemLength?: number;
  },
): string[] | undefined => {
  const parsed = parseOptionalStringArrayBody(value, {
    fieldName,
    maxItems,
    maxItemLength,
  });
  if (!parsed) {
    return undefined;
  }

  const normalized: string[] = [];
  for (const role of parsed) {
    const normalizedRole = role.toLowerCase();
    if (!AGENT_GATEWAY_ROLE_PATTERN.test(normalizedRole)) {
      throw new ServiceError(
        'ADMIN_INVALID_BODY',
        `${fieldName} items must use a valid role format.`,
        400,
      );
    }
    normalized.push(normalizedRole);
  }

  return Array.from(new Set(normalized));
};

const parseOptionalObjectBody = (
  value: unknown,
  {
    fieldName,
    maxKeys = 50,
    maxJsonLength = 12_000,
  }: {
    fieldName: string;
    maxKeys?: number;
    maxJsonLength?: number;
  },
): Record<string, unknown> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!(value && typeof value === 'object') || Array.isArray(value)) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must be an object.`,
      400,
    );
  }

  const record = value as Record<string, unknown>;
  const keyCount = Object.keys(record).length;
  if (keyCount > maxKeys) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} supports up to ${maxKeys} keys.`,
      400,
    );
  }

  let serialized = '';
  try {
    serialized = JSON.stringify(record);
  } catch {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} must be JSON-serializable.`,
      400,
    );
  }

  if (serialized.length > maxJsonLength) {
    throw new ServiceError(
      'ADMIN_INVALID_BODY',
      `${fieldName} exceeds max payload size (${maxJsonLength} chars).`,
      400,
    );
  }

  return record;
};

const parseOptionalStringArrayStrict = (
  value: unknown,
  {
    fieldName,
    maxItems = AI_RUNTIME_DRY_RUN_MAX_ARRAY_ITEMS,
    maxItemLength = AI_RUNTIME_DRY_RUN_MAX_ARRAY_ITEM_LENGTH,
  }: { fieldName: string; maxItems?: number; maxItemLength?: number },
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ServiceError(
      'AI_RUNTIME_INVALID_INPUT',
      `${fieldName} must be an array of strings.`,
      400,
    );
  }
  if (value.length > maxItems) {
    throw new ServiceError(
      'AI_RUNTIME_INVALID_INPUT',
      `${fieldName} supports up to ${maxItems} items.`,
      400,
    );
  }
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ServiceError(
        'AI_RUNTIME_INVALID_INPUT',
        `${fieldName} must contain strings only.`,
        400,
      );
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.length > maxItemLength) {
      throw new ServiceError(
        'AI_RUNTIME_INVALID_INPUT',
        `${fieldName} items must be at most ${maxItemLength} characters.`,
        400,
      );
    }
    const identifier = trimmed.toLowerCase();
    if (!AI_RUNTIME_PROVIDER_IDENTIFIER_PATTERN.test(identifier)) {
      throw new ServiceError(
        'AI_RUNTIME_INVALID_INPUT',
        `${fieldName} items must use provider identifier format.`,
        400,
      );
    }
    normalized.push(identifier);
  }
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
};

const parseOptionalRuntimeTimeout = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ServiceError(
      'AI_RUNTIME_INVALID_TIMEOUT',
      'timeoutMs must be a positive number.',
      400,
    );
  }
  const normalized = Math.floor(parsed);
  if (normalized > AI_RUNTIME_DRY_RUN_MAX_TIMEOUT_MS) {
    throw new ServiceError(
      'AI_RUNTIME_INVALID_TIMEOUT',
      `timeoutMs must be <= ${AI_RUNTIME_DRY_RUN_MAX_TIMEOUT_MS}.`,
      400,
    );
  }
  return normalized;
};

const getRealtime = (req: Request) =>
  req.app.get('realtime') as RealtimeService | undefined;

const toObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toInteger = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toUtcHourBucket = (value: string): string | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  const year = parsed.getUTCFullYear();
  const month = `${parsed.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getUTCDate()}`.padStart(2, '0');
  const hour = `${parsed.getUTCHours()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00:00Z`;
};

const bump = (bucket: Record<string, number>, key: string, amount = 1) => {
  bucket[key] = (bucket[key] ?? 0) + amount;
};

const isDraftCycleStepEvent = (eventType: string) =>
  eventType.startsWith('draft_cycle_') && eventType.endsWith('_completed');

const buildAgentGatewaySessionSummary = (detail: AgentGatewaySessionDetail) => {
  const byType: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const providerUsage: Record<string, number> = {};
  const attemptStatus: Record<string, number> = {};

  let draftCycleStepCount = 0;
  let failedStepCount = 0;
  let cycleCompletedCount = 0;
  let cycleFailedCount = 0;
  let compactCount = 0;
  let prunedCountTotal = 0;
  let lastCompactedAt: string | null = null;

  for (const event of detail.events) {
    bump(byType, event.type);
    bump(byRole, event.fromRole);
    if (event.type === 'draft_cycle_completed') {
      cycleCompletedCount += 1;
    }
    if (event.type === 'draft_cycle_failed') {
      cycleFailedCount += 1;
    }
    if (isDraftCycleStepEvent(event.type)) {
      draftCycleStepCount += 1;
    }

    const payload = toObject(event.payload);
    if (payload.failed === true) {
      failedStepCount += 1;
    }

    const selectedProvider = toStringOrNull(payload.selectedProvider);
    if (selectedProvider) {
      bump(providerUsage, selectedProvider);
    }

    const attemptsRaw = payload.attempts;
    if (Array.isArray(attemptsRaw)) {
      for (const attempt of attemptsRaw) {
        if (!attempt || typeof attempt !== 'object') {
          continue;
        }
        const status = toStringOrNull(
          (attempt as Record<string, unknown>).status,
        );
        if (status) {
          bump(attemptStatus, status);
        }
      }
    }

    if (event.type === 'session_compacted') {
      compactCount += 1;
      prunedCountTotal += toInteger(payload.prunedCount);
      lastCompactedAt = event.createdAt;
    }
  }

  const lastEvent = detail.events.at(-1) ?? null;
  const startedAtMs = Date.parse(detail.session.createdAt);
  const endedAtMs = Date.parse(
    lastEvent?.createdAt ?? detail.session.updatedAt,
  );
  const durationMs =
    Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)
      ? Math.max(0, endedAtMs - startedAtMs)
      : null;

  return {
    session: {
      id: detail.session.id,
      channel: detail.session.channel,
      draftId: detail.session.draftId,
      externalSessionId: detail.session.externalSessionId,
      status: detail.session.status,
      createdAt: detail.session.createdAt,
      updatedAt: detail.session.updatedAt,
    },
    totals: {
      eventCount: detail.events.length,
      uniqueEventTypes: Object.keys(byType).length,
      uniqueRoles: Object.keys(byRole).length,
      draftCycleStepCount,
      failedStepCount,
      cycleCompletedCount,
      cycleFailedCount,
      durationMs,
    },
    byType,
    byRole,
    providerUsage,
    attemptStatus,
    compaction: {
      compactCount,
      prunedCountTotal,
      lastCompactedAt,
    },
    lastEvent: lastEvent
      ? {
          id: lastEvent.id,
          type: lastEvent.type,
          fromRole: lastEvent.fromRole,
          toRole: lastEvent.toRole,
          createdAt: lastEvent.createdAt,
        }
      : null,
  };
};

const buildAgentGatewaySessionStatus = (detail: AgentGatewaySessionDetail) => {
  const summary = buildAgentGatewaySessionSummary(detail);
  const failedStepCount = summary.totals.failedStepCount;
  const cycleFailedCount = summary.totals.cycleFailedCount;
  const needsAttention = failedStepCount > 0 || cycleFailedCount > 0;

  return {
    sessionId: summary.session.id,
    channel: summary.session.channel,
    draftId: summary.session.draftId,
    status: summary.session.status,
    updatedAt: summary.session.updatedAt,
    lastEventType: summary.lastEvent?.type ?? null,
    eventCount: summary.totals.eventCount,
    durationMs: summary.totals.durationMs,
    cycleCompletedCount: summary.totals.cycleCompletedCount,
    cycleFailedCount,
    failedStepCount,
    compactCount: summary.compaction.compactCount,
    needsAttention,
    health: needsAttention ? 'attention' : 'ok',
  };
};

const toGatewayEventPayload = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

interface AgentGatewayTelemetrySessionRow {
  id: string;
  status: string;
  channel: string;
  updatedAt: string;
}

interface AgentGatewayTelemetryEventRow {
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface AgentGatewayAdapterTelemetryRow {
  adapter: string;
  eventType: string;
  count: number;
  lastSeenAt: string | null;
}

interface AgentGatewayIngestTelemetryRow {
  connectorId: string;
  connectorRiskLevel: string | null;
  eventType: string;
  errorCode: string | null;
  count: number;
  lastSeenAt: string | null;
}

interface AgentGatewayCompactionHourlyBucket {
  hour: string;
  compactions: number;
  autoCompactions: number;
  manualCompactions: number;
  prunedEventCount: number;
}

type AgentGatewayRiskLevel = 'critical' | 'healthy' | 'unknown' | 'watch';

interface AgentGatewayTelemetryAccumulator {
  providerUsage: Record<string, number>;
  channelUsage: Record<string, number>;
  compactionHourlyBuckets: Map<string, AgentGatewayCompactionHourlyBucket>;
  activeSessions: number;
  closedSessions: number;
  attentionSessions: number;
  compactedSessions: number;
  autoCompactedSessions: number;
  totalEvents: number;
  draftCycleStepEvents: number;
  failedStepEvents: number;
  compactionEvents: number;
  autoCompactionEvents: number;
  manualCompactionEvents: number;
  prunedEventCount: number;
  attemptSuccess: number;
  attemptFailed: number;
  attemptSkippedCooldown: number;
}

interface AgentGatewaySessionFlags {
  hasAttention: boolean;
  hasCompaction: boolean;
  hasAutoCompaction: boolean;
}

interface AgentGatewayAboveRiskThresholds {
  criticalAbove: number;
  watchAbove: number;
}

interface AgentGatewayBelowRiskThresholds {
  criticalBelow: number;
  watchBelow: number;
}

interface AgentGatewayTelemetryThresholds {
  autoCompactionShare: AgentGatewayAboveRiskThresholds;
  failedStepRate: AgentGatewayAboveRiskThresholds;
  runtimeSuccessRate: AgentGatewayBelowRiskThresholds;
  cooldownSkipRate: AgentGatewayAboveRiskThresholds;
}

const AGENT_GATEWAY_TELEMETRY_THRESHOLDS: AgentGatewayTelemetryThresholds = {
  autoCompactionShare: {
    criticalAbove: 0.8,
    watchAbove: 0.5,
  },
  failedStepRate: {
    criticalAbove: 0.5,
    watchAbove: 0.25,
  },
  runtimeSuccessRate: {
    criticalBelow: 0.5,
    watchBelow: 0.75,
  },
  cooldownSkipRate: {
    criticalAbove: 0.4,
    watchAbove: 0.2,
  },
};

const AGENT_GATEWAY_ADAPTER_ERROR_BUDGET_TARGET = 0.05;
const AGENT_GATEWAY_ADAPTER_ERROR_THRESHOLDS = {
  watchAbove: 0.1,
  criticalAbove: 0.25,
};
const AGENT_GATEWAY_ADAPTER_REGISTRY = [
  'web',
  'live_session',
  'external_webhook',
] as const;
const AGENT_GATEWAY_ADAPTER_ROUTE_SUCCESS_EVENT =
  'agent_gateway_adapter_route_success';
const AGENT_GATEWAY_ADAPTER_ROUTE_FAILED_EVENT =
  'agent_gateway_adapter_route_failed';
const AGENT_GATEWAY_INGEST_ACCEPT_EVENT = 'agent_gateway_ingest_accept';
const AGENT_GATEWAY_INGEST_REPLAY_EVENT = 'agent_gateway_ingest_replay';
const AGENT_GATEWAY_INGEST_REJECT_EVENT = 'agent_gateway_ingest_reject';
const AGENT_GATEWAY_INGEST_CONNECTOR_REJECT_THRESHOLDS = {
  watchAbove: 0.1,
  criticalAbove: 0.25,
};

const createAgentGatewayTelemetryAccumulator =
  (): AgentGatewayTelemetryAccumulator => ({
    providerUsage: {},
    channelUsage: {},
    compactionHourlyBuckets: new Map<
      string,
      AgentGatewayCompactionHourlyBucket
    >(),
    activeSessions: 0,
    closedSessions: 0,
    attentionSessions: 0,
    compactedSessions: 0,
    autoCompactedSessions: 0,
    totalEvents: 0,
    draftCycleStepEvents: 0,
    failedStepEvents: 0,
    compactionEvents: 0,
    autoCompactionEvents: 0,
    manualCompactionEvents: 0,
    prunedEventCount: 0,
    attemptSuccess: 0,
    attemptFailed: 0,
    attemptSkippedCooldown: 0,
  });

const isAutoCompactionReason = (reason: string) =>
  reason === 'auto_buffer_limit' || reason.startsWith('auto');

const resolveAutoCompactionRiskLevel = (
  share: number | null,
): AgentGatewayRiskLevel => {
  if (typeof share !== 'number' || !Number.isFinite(share)) {
    return 'unknown';
  }
  if (
    share >=
    AGENT_GATEWAY_TELEMETRY_THRESHOLDS.autoCompactionShare.criticalAbove
  ) {
    return 'critical';
  }
  if (
    share >= AGENT_GATEWAY_TELEMETRY_THRESHOLDS.autoCompactionShare.watchAbove
  ) {
    return 'watch';
  }
  return 'healthy';
};

const resolveAboveRiskLevel = (
  value: number | null,
  {
    criticalAbove,
    watchAbove,
  }: {
    criticalAbove: number;
    watchAbove: number;
  },
): AgentGatewayRiskLevel => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (value >= criticalAbove) {
    return 'critical';
  }
  if (value >= watchAbove) {
    return 'watch';
  }
  return 'healthy';
};

const resolveBelowRiskLevel = (
  value: number | null,
  {
    criticalBelow,
    watchBelow,
  }: {
    criticalBelow: number;
    watchBelow: number;
  },
): AgentGatewayRiskLevel => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (value < criticalBelow) {
    return 'critical';
  }
  if (value < watchBelow) {
    return 'watch';
  }
  return 'healthy';
};

const mergeRiskLevels = (
  levels: AgentGatewayRiskLevel[],
): AgentGatewayRiskLevel => {
  if (levels.includes('critical')) {
    return 'critical';
  }
  if (levels.includes('watch')) {
    return 'watch';
  }
  if (levels.includes('healthy')) {
    return 'healthy';
  }
  return 'unknown';
};

const normalizeConnectorConfiguredRiskLevel = (
  value: string | null,
): 'restricted' | 'standard' | 'trusted' | 'unknown' => {
  if (!value) {
    return 'unknown';
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'restricted' ||
    normalized === 'standard' ||
    normalized === 'trusted'
  ) {
    return normalized;
  }
  return 'unknown';
};

const mapConfiguredConnectorRiskToHealth = (
  level: 'restricted' | 'standard' | 'trusted' | 'unknown',
): AgentGatewayRiskLevel => {
  if (level === 'restricted') {
    return 'watch';
  }
  if (level === 'trusted' || level === 'standard') {
    return 'healthy';
  }
  return 'unknown';
};

const accumulateAgentGatewayAttemptMetrics = (
  accumulator: AgentGatewayTelemetryAccumulator,
  payload: Record<string, unknown>,
) => {
  const attemptsRaw = payload.attempts;
  if (!Array.isArray(attemptsRaw)) {
    return;
  }
  for (const attempt of attemptsRaw) {
    if (!attempt || typeof attempt !== 'object') {
      continue;
    }
    const status = toStringOrNull((attempt as Record<string, unknown>).status);
    if (status === 'success') {
      accumulator.attemptSuccess += 1;
      continue;
    }
    if (status === 'failed') {
      accumulator.attemptFailed += 1;
      continue;
    }
    if (status === 'skipped_cooldown') {
      accumulator.attemptSkippedCooldown += 1;
    }
  }
};

const accumulateAgentGatewayCompactionMetrics = (
  accumulator: AgentGatewayTelemetryAccumulator,
  event: AgentGatewayTelemetryEventRow,
  payload: Record<string, unknown>,
  flags: AgentGatewaySessionFlags,
) => {
  if (event.type !== 'session_compacted') {
    return;
  }
  accumulator.compactionEvents += 1;
  flags.hasCompaction = true;

  const compactionReason =
    toStringOrNull(payload.reason)?.toLowerCase() ?? 'manual';
  const isAuto = isAutoCompactionReason(compactionReason);
  if (isAuto) {
    accumulator.autoCompactionEvents += 1;
    flags.hasAutoCompaction = true;
  } else {
    accumulator.manualCompactionEvents += 1;
  }

  const prunedCount = Math.max(
    0,
    Number(payload.prunedCount ?? payload.pruned_count ?? 0),
  );
  accumulator.prunedEventCount += prunedCount;

  const bucketHour = toUtcHourBucket(event.createdAt);
  if (!bucketHour) {
    return;
  }
  const bucket = accumulator.compactionHourlyBuckets.get(bucketHour) ?? {
    hour: bucketHour,
    compactions: 0,
    autoCompactions: 0,
    manualCompactions: 0,
    prunedEventCount: 0,
  };
  bucket.compactions += 1;
  if (isAuto) {
    bucket.autoCompactions += 1;
  } else {
    bucket.manualCompactions += 1;
  }
  bucket.prunedEventCount += prunedCount;
  accumulator.compactionHourlyBuckets.set(bucketHour, bucket);
};

const accumulateAgentGatewayEventMetrics = (
  accumulator: AgentGatewayTelemetryAccumulator,
  event: AgentGatewayTelemetryEventRow,
  flags: AgentGatewaySessionFlags,
) => {
  const selectedProvider = toStringOrNull(event.payload.selectedProvider);
  if (selectedProvider) {
    bump(accumulator.providerUsage, selectedProvider);
  }

  if (event.type === 'draft_cycle_failed') {
    flags.hasAttention = true;
  }
  if (isDraftCycleStepEvent(event.type)) {
    accumulator.draftCycleStepEvents += 1;
    if (event.payload.failed === true) {
      accumulator.failedStepEvents += 1;
      flags.hasAttention = true;
    }
  }

  const payload = toObject(event.payload);
  accumulateAgentGatewayCompactionMetrics(accumulator, event, payload, flags);
  accumulateAgentGatewayAttemptMetrics(accumulator, payload);
};

const finalizeAgentGatewaySessionFlags = (
  accumulator: AgentGatewayTelemetryAccumulator,
  flags: AgentGatewaySessionFlags,
) => {
  if (flags.hasCompaction) {
    accumulator.compactedSessions += 1;
  }
  if (flags.hasAutoCompaction) {
    accumulator.autoCompactedSessions += 1;
  }
  if (flags.hasAttention) {
    accumulator.attentionSessions += 1;
  }
};

const selectLatestTimestamp = (left: string | null, right: string | null) => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return Date.parse(left) >= Date.parse(right) ? left : right;
};

const buildAgentGatewayAdapterMetrics = (
  adapterRows: AgentGatewayAdapterTelemetryRow[],
  { includeRegistry }: { includeRegistry: boolean },
) => {
  const adapterByName = new Map<
    string,
    {
      adapter: string;
      success: number;
      failed: number;
      total: number;
      errorRate: number | null;
      riskLevel: AgentGatewayRiskLevel;
      lastSeenAt: string | null;
    }
  >();
  let adapterSuccessTotal = 0;
  let adapterFailedTotal = 0;

  for (const row of adapterRows) {
    const adapter = row.adapter.trim().toLowerCase();
    if (adapter.length < 1) {
      continue;
    }
    const current = adapterByName.get(adapter) ?? {
      adapter,
      success: 0,
      failed: 0,
      total: 0,
      errorRate: null,
      riskLevel: 'unknown',
      lastSeenAt: null,
    };
    if (row.eventType === AGENT_GATEWAY_ADAPTER_ROUTE_SUCCESS_EVENT) {
      current.success += row.count;
      adapterSuccessTotal += row.count;
    } else if (row.eventType === AGENT_GATEWAY_ADAPTER_ROUTE_FAILED_EVENT) {
      current.failed += row.count;
      adapterFailedTotal += row.count;
    }
    current.lastSeenAt = selectLatestTimestamp(
      current.lastSeenAt,
      row.lastSeenAt,
    );
    adapterByName.set(adapter, current);
  }

  if (includeRegistry) {
    for (const adapter of AGENT_GATEWAY_ADAPTER_REGISTRY) {
      if (adapterByName.has(adapter)) {
        continue;
      }
      adapterByName.set(adapter, {
        adapter,
        success: 0,
        failed: 0,
        total: 0,
        errorRate: 0,
        riskLevel: 'healthy',
        lastSeenAt: null,
      });
    }
  }

  const adapterUsage = [...adapterByName.values()]
    .map((item) => {
      const total = item.success + item.failed;
      const errorRate = toRate(item.failed, total);
      return {
        ...item,
        total,
        errorRate,
        riskLevel: resolveAboveRiskLevel(
          errorRate,
          AGENT_GATEWAY_ADAPTER_ERROR_THRESHOLDS,
        ),
      };
    })
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      return left.adapter.localeCompare(right.adapter);
    });
  const adapterTotal = adapterSuccessTotal + adapterFailedTotal;
  const adapterErrorRate = toRate(adapterFailedTotal, adapterTotal);
  const adapterErrorBudgetConsumed =
    typeof adapterErrorRate === 'number' ? adapterErrorRate : null;
  const adapterErrorBudgetRemaining =
    typeof adapterErrorBudgetConsumed === 'number'
      ? Number(
          Math.max(
            0,
            AGENT_GATEWAY_ADAPTER_ERROR_BUDGET_TARGET -
              adapterErrorBudgetConsumed,
          ).toFixed(3),
        )
      : null;
  const adapterErrorBudgetRiskLevel = resolveAboveRiskLevel(
    adapterErrorRate,
    AGENT_GATEWAY_ADAPTER_ERROR_THRESHOLDS,
  );

  return {
    total: adapterTotal,
    success: adapterSuccessTotal,
    failed: adapterFailedTotal,
    errorRate: adapterErrorRate,
    errorBudget: {
      target: AGENT_GATEWAY_ADAPTER_ERROR_BUDGET_TARGET,
      consumed: adapterErrorBudgetConsumed,
      remaining: adapterErrorBudgetRemaining,
      level: adapterErrorBudgetRiskLevel,
    },
    usage: adapterUsage,
    thresholds: AGENT_GATEWAY_ADAPTER_ERROR_THRESHOLDS,
    registry: [...AGENT_GATEWAY_ADAPTER_REGISTRY],
  };
};

const buildAgentGatewayIngestConnectorMetrics = (
  ingestRows: AgentGatewayIngestTelemetryRow[],
) => {
  const connectorById = new Map<
    string,
    {
      connectorId: string;
      configuredRiskLevel: 'restricted' | 'standard' | 'trusted' | 'unknown';
      accepted: number;
      replayed: number;
      rejected: number;
      rateLimited: number;
      total: number;
      rejectRate: number | null;
      rateLimitedShare: number | null;
      riskLevel: AgentGatewayRiskLevel;
      lastSeenAt: string | null;
    }
  >();

  let acceptedTotal = 0;
  let replayedTotal = 0;
  let rejectedTotal = 0;
  let rateLimitedTotal = 0;

  for (const row of ingestRows) {
    const connectorId = row.connectorId.trim().toLowerCase();
    if (connectorId.length < 1) {
      continue;
    }
    const configuredRiskLevel = normalizeConnectorConfiguredRiskLevel(
      row.connectorRiskLevel,
    );
    const current = connectorById.get(connectorId) ?? {
      connectorId,
      configuredRiskLevel,
      accepted: 0,
      replayed: 0,
      rejected: 0,
      rateLimited: 0,
      total: 0,
      rejectRate: null,
      rateLimitedShare: null,
      riskLevel: 'unknown',
      lastSeenAt: null,
    };
    current.configuredRiskLevel =
      current.configuredRiskLevel === 'unknown'
        ? configuredRiskLevel
        : current.configuredRiskLevel;

    if (row.eventType === AGENT_GATEWAY_INGEST_ACCEPT_EVENT) {
      current.accepted += row.count;
      acceptedTotal += row.count;
    } else if (row.eventType === AGENT_GATEWAY_INGEST_REPLAY_EVENT) {
      current.replayed += row.count;
      replayedTotal += row.count;
    } else if (row.eventType === AGENT_GATEWAY_INGEST_REJECT_EVENT) {
      current.rejected += row.count;
      rejectedTotal += row.count;
      if (
        row.errorCode?.trim().toUpperCase() ===
        'AGENT_GATEWAY_INGEST_CONNECTOR_RATE_LIMITED'
      ) {
        current.rateLimited += row.count;
        rateLimitedTotal += row.count;
      }
    }

    current.lastSeenAt = selectLatestTimestamp(
      current.lastSeenAt,
      row.lastSeenAt,
    );
    connectorById.set(connectorId, current);
  }

  for (const [connectorId, policy] of AGENT_GATEWAY_CONNECTOR_POLICY_MAP) {
    if (connectorById.has(connectorId)) {
      continue;
    }
    connectorById.set(connectorId, {
      connectorId,
      configuredRiskLevel: policy.riskLevel,
      accepted: 0,
      replayed: 0,
      rejected: 0,
      rateLimited: 0,
      total: 0,
      rejectRate: null,
      rateLimitedShare: null,
      riskLevel: mapConfiguredConnectorRiskToHealth(policy.riskLevel),
      lastSeenAt: null,
    });
  }

  const usage = [...connectorById.values()]
    .map((item) => {
      const total = item.accepted + item.replayed + item.rejected;
      const rejectRate = toRate(item.rejected, total);
      const rateLimitedShare = toRate(item.rateLimited, item.rejected);
      const policyLevel = mapConfiguredConnectorRiskToHealth(
        item.configuredRiskLevel,
      );
      const activityLevel = resolveAboveRiskLevel(
        rejectRate,
        AGENT_GATEWAY_INGEST_CONNECTOR_REJECT_THRESHOLDS,
      );
      return {
        ...item,
        total,
        rejectRate,
        rateLimitedShare,
        riskLevel: mergeRiskLevels([policyLevel, activityLevel]),
      };
    })
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      return left.connectorId.localeCompare(right.connectorId);
    });

  const total = acceptedTotal + replayedTotal + rejectedTotal;
  return {
    total,
    accepted: acceptedTotal,
    replayed: replayedTotal,
    rejected: rejectedTotal,
    rateLimited: rateLimitedTotal,
    rejectRate: toRate(rejectedTotal, total),
    rateLimitedShare: toRate(rateLimitedTotal, rejectedTotal),
    usage,
    thresholds: AGENT_GATEWAY_INGEST_CONNECTOR_REJECT_THRESHOLDS,
  };
};

const buildAgentGatewayConnectorPolicySnapshot = () => {
  const policies = [...AGENT_GATEWAY_CONNECTOR_POLICY_MAP.values()]
    .map((policy) => ({
      connectorId: policy.connectorId,
      riskLevel: policy.riskLevel,
      requireConnectorSecret: policy.requireConnectorSecret,
      rateLimitMax: policy.rateLimitMax,
      maxPayloadKeys: policy.maxPayloadKeys,
      maxMetadataKeys: policy.maxMetadataKeys,
      maxPayloadBytes: policy.maxPayloadBytes,
    }))
    .sort((left, right) => left.connectorId.localeCompare(right.connectorId));

  return {
    total: policies.length,
    defaults: {
      riskLevel: 'standard',
      requireConnectorSecret:
        env.AGENT_GATEWAY_INGEST_REQUIRE_CONNECTOR_SECRET === 'true',
      rateLimitMax: env.AGENT_GATEWAY_INGEST_CONNECTOR_RATE_LIMIT_MAX,
      rateLimitWindowSec:
        env.AGENT_GATEWAY_INGEST_CONNECTOR_RATE_LIMIT_WINDOW_SEC,
    },
    policies,
  };
};

const buildAgentGatewayTelemetrySnapshot = (
  sessionRows: AgentGatewayTelemetrySessionRow[],
  eventRows: AgentGatewayTelemetryEventRow[],
  adapterRows: AgentGatewayAdapterTelemetryRow[],
  ingestRows: AgentGatewayIngestTelemetryRow[],
) => {
  const eventsBySession = new Map<string, AgentGatewayTelemetryEventRow[]>();
  for (const eventRow of eventRows) {
    if (!eventRow.sessionId) {
      continue;
    }
    const bucket = eventsBySession.get(eventRow.sessionId) ?? [];
    bucket.push(eventRow);
    eventsBySession.set(eventRow.sessionId, bucket);
  }

  const accumulator = createAgentGatewayTelemetryAccumulator();

  for (const sessionRow of sessionRows) {
    const sessionEvents = eventsBySession.get(sessionRow.id) ?? [];
    accumulator.totalEvents += sessionEvents.length;
    bump(accumulator.channelUsage, sessionRow.channel);

    if (sessionRow.status === 'active') {
      accumulator.activeSessions += 1;
    } else if (sessionRow.status === 'closed') {
      accumulator.closedSessions += 1;
    }

    const flags: AgentGatewaySessionFlags = {
      hasAttention: false,
      hasCompaction: false,
      hasAutoCompaction: false,
    };

    for (const event of sessionEvents) {
      accumulateAgentGatewayEventMetrics(accumulator, event, flags);
    }
    finalizeAgentGatewaySessionFlags(accumulator, flags);
  }

  const totalSessions = sessionRows.length;
  const totalAttempts =
    accumulator.attemptSuccess +
    accumulator.attemptFailed +
    accumulator.attemptSkippedCooldown;
  const providerUsageItems = Object.entries(accumulator.providerUsage)
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => right.count - left.count);
  const channelUsageItems = Object.entries(accumulator.channelUsage)
    .map(([channel, count]) => ({ channel, count }))
    .sort((left, right) => right.count - left.count);
  const compactionHourlyTrend = [
    ...accumulator.compactionHourlyBuckets.values(),
  ]
    .sort((left, right) => left.hour.localeCompare(right.hour))
    .map((bucket) => {
      const autoCompactionShare = toRate(
        bucket.autoCompactions,
        bucket.compactions,
      );
      return {
        ...bucket,
        autoCompactionShare,
        autoCompactionRiskLevel:
          resolveAutoCompactionRiskLevel(autoCompactionShare),
      };
    });
  const autoCompactionShare = toRate(
    accumulator.autoCompactionEvents,
    accumulator.compactionEvents,
  );
  const failedStepRate = toRate(
    accumulator.failedStepEvents,
    accumulator.draftCycleStepEvents,
  );
  const successRate = toRate(accumulator.attemptSuccess, totalAttempts);
  const skippedRate = toRate(accumulator.attemptSkippedCooldown, totalAttempts);
  const autoCompactionRiskLevel =
    resolveAutoCompactionRiskLevel(autoCompactionShare);
  const failedStepRiskLevel = resolveAboveRiskLevel(
    failedStepRate,
    AGENT_GATEWAY_TELEMETRY_THRESHOLDS.failedStepRate,
  );
  const runtimeSuccessRiskLevel = resolveBelowRiskLevel(
    successRate,
    AGENT_GATEWAY_TELEMETRY_THRESHOLDS.runtimeSuccessRate,
  );
  const cooldownSkipRiskLevel = resolveAboveRiskLevel(
    skippedRate,
    AGENT_GATEWAY_TELEMETRY_THRESHOLDS.cooldownSkipRate,
  );
  const telemetryHealthLevel = mergeRiskLevels([
    autoCompactionRiskLevel,
    failedStepRiskLevel,
    runtimeSuccessRiskLevel,
    cooldownSkipRiskLevel,
  ]);

  const adapterMetrics = buildAgentGatewayAdapterMetrics(adapterRows, {
    includeRegistry: false,
  });
  const ingestConnectorMetrics =
    buildAgentGatewayIngestConnectorMetrics(ingestRows);

  return {
    sessions: {
      total: totalSessions,
      active: accumulator.activeSessions,
      closed: accumulator.closedSessions,
      attention: accumulator.attentionSessions,
      compacted: accumulator.compactedSessions,
      autoCompacted: accumulator.autoCompactedSessions,
      attentionRate: toRate(accumulator.attentionSessions, totalSessions),
      compactionRate: toRate(accumulator.compactedSessions, totalSessions),
      autoCompactedRate: toRate(
        accumulator.autoCompactedSessions,
        totalSessions,
      ),
    },
    events: {
      total: accumulator.totalEvents,
      draftCycleStepEvents: accumulator.draftCycleStepEvents,
      failedStepEvents: accumulator.failedStepEvents,
      compactionEvents: accumulator.compactionEvents,
      autoCompactionEvents: accumulator.autoCompactionEvents,
      manualCompactionEvents: accumulator.manualCompactionEvents,
      autoCompactionShare,
      autoCompactionRiskLevel,
      prunedEventCount: accumulator.prunedEventCount,
      compactionHourlyTrend,
      failedStepRate,
    },
    health: {
      level: telemetryHealthLevel,
      failedStepLevel: failedStepRiskLevel,
      runtimeSuccessLevel: runtimeSuccessRiskLevel,
      cooldownSkipLevel: cooldownSkipRiskLevel,
      autoCompactionLevel: autoCompactionRiskLevel,
    },
    thresholds: AGENT_GATEWAY_TELEMETRY_THRESHOLDS,
    attempts: {
      total: totalAttempts,
      success: accumulator.attemptSuccess,
      failed: accumulator.attemptFailed,
      skippedCooldown: accumulator.attemptSkippedCooldown,
      successRate,
      failureRate: toRate(accumulator.attemptFailed, totalAttempts),
      skippedRate,
    },
    providerUsage: providerUsageItems,
    channelUsage: channelUsageItems,
    adapters: adapterMetrics,
    ingestConnectors: ingestConnectorMetrics,
  };
};

interface BudgetRemainingPayload {
  date: string;
  agent?: {
    id: string;
    counts: { pr: number; major_pr: number; fix_request: number };
    limits: Record<string, number>;
    remaining: { pr: number; major_pr: number; fix_request: number };
  };
  draft?: {
    id: string;
    counts: { pr: number; major_pr: number; fix_request: number };
    limits: Record<string, number>;
    remaining: { pr: number; major_pr: number; fix_request: number };
  };
}

const toCounts = (data: Record<string, string>) => ({
  pr: toNumber(data.prCount),
  major_pr: toNumber(data.majorPrCount),
  fix_request: toNumber(data.fixRequestCount),
});

const buildRemaining = (
  counts: { pr: number; major_pr: number; fix_request: number },
  limits: Record<string, number>,
) => ({
  pr: Math.max(0, limits.pr - counts.pr),
  major_pr: Math.max(0, limits.major_pr - counts.major_pr),
  fix_request: Math.max(0, limits.fix_request - counts.fix_request),
});

const parseDateParam = (value?: string) => {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ServiceError(
      'INVALID_DATE',
      'Invalid date format. Use YYYY-MM-DD.',
      400,
    );
  }
  return parsed;
};

const recordCleanupRun = async (
  jobName: string,
  status: 'success' | 'failed',
  startedAt: Date,
  metadata?: Record<string, unknown>,
  errorMessage?: string,
) => {
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  try {
    await db.query(
      `INSERT INTO job_runs (job_name, status, started_at, finished_at, duration_ms, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        jobName,
        status,
        startedAt,
        finishedAt,
        durationMs,
        errorMessage ?? null,
        metadata ?? {},
      ],
    );
  } catch (recordError) {
    console.error('Cleanup run record failed', recordError);
  }
};

router.post(
  '/admin/embeddings/backfill',
  requireAdmin,
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['batchSize', 'maxBatches'],
        endpoint: '/api/admin/embeddings/backfill',
      });
      const body = assertAllowedBodyFields(req.body, {
        allowed: ['batchSize', 'maxBatches'],
        endpoint: '/api/admin/embeddings/backfill',
      });

      const queryBatchSize = parseBoundedOptionalInt(query.batchSize, {
        fieldName: 'batchSize',
        min: 1,
        max: 1000,
      });
      const bodyBatchSize = parseBoundedOptionalInt(body.batchSize, {
        fieldName: 'batchSize',
        min: 1,
        max: 1000,
        invalidCode: 'ADMIN_INVALID_BODY',
      });
      if (
        queryBatchSize !== undefined &&
        bodyBatchSize !== undefined &&
        queryBatchSize !== bodyBatchSize
      ) {
        throw new ServiceError(
          'ADMIN_INPUT_CONFLICT',
          'batchSize in query and body must match when both are provided.',
          400,
        );
      }
      const batchSize = bodyBatchSize ?? queryBatchSize ?? 200;

      const queryMaxBatches = parseBoundedOptionalInt(query.maxBatches, {
        fieldName: 'maxBatches',
        min: 1,
        max: 20,
      });
      const bodyMaxBatches = parseBoundedOptionalInt(body.maxBatches, {
        fieldName: 'maxBatches',
        min: 1,
        max: 20,
        invalidCode: 'ADMIN_INVALID_BODY',
      });
      if (
        queryMaxBatches !== undefined &&
        bodyMaxBatches !== undefined &&
        queryMaxBatches !== bodyMaxBatches
      ) {
        throw new ServiceError(
          'ADMIN_INPUT_CONFLICT',
          'maxBatches in query and body must match when both are provided.',
          400,
        );
      }
      const maxBatches = bodyMaxBatches ?? queryMaxBatches ?? 1;

      let processed = 0;
      let inserted = 0;
      let skipped = 0;
      let batches = 0;

      for (let i = 0; i < maxBatches; i += 1) {
        const result =
          await embeddingBackfillService.backfillDraftEmbeddings(batchSize);
        processed += result.processed;
        inserted += result.inserted;
        skipped += result.skipped;
        batches += 1;

        if (result.processed < batchSize) {
          break;
        }
      }

      res.json({ batches, batchSize, processed, inserted, skipped });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/embeddings/metrics',
  requireAdmin,
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['hours'],
        endpoint: '/api/admin/embeddings/metrics',
      });
      const hours = parseBoundedQueryInt(query.hours, {
        fieldName: 'hours',
        defaultValue: 24,
        min: 1,
        max: 720,
      });
      const summary = await db.query(
        `SELECT provider,
              success,
              fallback_used,
              COUNT(*)::int AS count,
              AVG(duration_ms)::float AS avg_duration_ms,
              AVG(embedding_length)::float AS avg_length
       FROM embedding_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY provider, success, fallback_used
       ORDER BY count DESC`,
        [hours],
      );

      res.json({ windowHours: hours, rows: summary.rows });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/admin/ai-runtime/profiles', requireAdmin, (req, res) => {
  assertAllowedQueryFields(req.query, {
    allowed: [],
    endpoint: '/api/admin/ai-runtime/profiles',
  });
  res.json({
    profiles: aiRuntimeService.getProfiles(),
    providers: aiRuntimeService.getProviderStates(),
  });
});

router.get('/admin/ai-runtime/health', requireAdmin, (req, res) => {
  assertAllowedQueryFields(req.query, {
    allowed: [],
    endpoint: '/api/admin/ai-runtime/health',
  });
  res.json(aiRuntimeService.getHealthSnapshot());
});

router.post(
  '/admin/ai-runtime/dry-run',
  requireAdmin,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(req.query, {
        allowed: [],
        endpoint: '/api/admin/ai-runtime/dry-run',
      });
      if (
        req.body === undefined ||
        req.body === null ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body)
      ) {
        throw new ServiceError(
          'AI_RUNTIME_INVALID_INPUT',
          'Body must be a JSON object.',
          400,
        );
      }
      const body = req.body as Record<string, unknown>;
      const unknownFields = Object.keys(body).filter(
        (field) => !AI_RUNTIME_DRY_RUN_ALLOWED_FIELDS.has(field),
      );
      if (unknownFields.length > 0) {
        throw new ServiceError(
          'AI_RUNTIME_DRY_RUN_INVALID_FIELDS',
          `Unsupported fields: ${unknownFields.join(', ')}.`,
          400,
        );
      }
      const roleRaw = body.role;
      const promptRaw = body.prompt;
      const providersOverrideRaw = body.providersOverride;
      const simulateFailuresRaw = body.simulateFailures;
      const timeoutMsRaw = body.timeoutMs;

      if (
        typeof roleRaw !== 'string' ||
        !RUNTIME_ROLES.includes(roleRaw as AIRuntimeRole)
      ) {
        throw new ServiceError(
          'AI_RUNTIME_INVALID_ROLE',
          'role must be one of author, critic, maker, judge.',
          400,
        );
      }
      if (typeof promptRaw !== 'string') {
        throw new ServiceError(
          'AI_RUNTIME_INVALID_PROMPT',
          'prompt is required.',
          400,
        );
      }
      const prompt = promptRaw.trim();
      if (prompt.length === 0) {
        throw new ServiceError(
          'AI_RUNTIME_INVALID_PROMPT',
          'prompt is required.',
          400,
        );
      }
      if (prompt.length > AI_RUNTIME_DRY_RUN_MAX_PROMPT_LENGTH) {
        throw new ServiceError(
          'AI_RUNTIME_INVALID_PROMPT',
          `prompt must be at most ${AI_RUNTIME_DRY_RUN_MAX_PROMPT_LENGTH} characters.`,
          400,
        );
      }

      const providersOverride = parseOptionalStringArrayStrict(
        providersOverrideRaw,
        { fieldName: 'providersOverride' },
      );
      const simulateFailures = parseOptionalStringArrayStrict(
        simulateFailuresRaw,
        { fieldName: 'simulateFailures' },
      );
      const timeoutMs = parseOptionalRuntimeTimeout(timeoutMsRaw);

      const result = await aiRuntimeService.runWithFailover({
        role: roleRaw as AIRuntimeRole,
        prompt,
        timeoutMs,
        providersOverride,
        simulateFailures,
        mutateProviderState: false,
      });

      res.json({
        result,
        providers: aiRuntimeService.getProviderStates(),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/agent-gateway/orchestrate',
  requireAdmin,
  async (req, res, next) => {
    try {
      if (env.AGENT_ORCHESTRATION_ENABLED !== 'true') {
        throw new ServiceError(
          'AGENT_ORCHESTRATION_DISABLED',
          'Agent orchestration is disabled by feature flag.',
          503,
        );
      }

      assertAllowedQueryFields(req.query, {
        allowed: [],
        endpoint: '/api/admin/agent-gateway/orchestrate',
      });
      const body = assertAllowedBodyFields(req.body, {
        allowed: [
          'draftId',
          'channel',
          'externalSessionId',
          'promptSeed',
          'hostAgentId',
          'metadata',
        ],
        endpoint: '/api/admin/agent-gateway/orchestrate',
      });
      const draftId = parseRequiredUuidBodyString(body.draftId, {
        fieldName: 'draftId',
      });
      const channel = parseOptionalGatewayChannelBodyString(body.channel, {
        fieldName: 'channel',
      });
      const externalSessionId = parseOptionalGatewayExternalSessionIdBodyString(
        body.externalSessionId,
        {
          fieldName: 'externalSessionId',
        },
      );
      const promptSeed = parseOptionalBoundedBodyString(body.promptSeed, {
        fieldName: 'promptSeed',
        maxLength: 4000,
      });
      const hostAgentId = parseOptionalUuidBodyString(body.hostAgentId, {
        fieldName: 'hostAgentId',
      });
      const metadata = parseOptionalObjectBody(body.metadata, {
        fieldName: 'metadata',
      });

      const realtime = getRealtime(req);
      const result = await draftOrchestrationService.run({
        draftId,
        channel,
        externalSessionId,
        promptSeed,
        hostAgentId,
        metadata,
        onStep: realtime
          ? (signal) => {
              const payload = {
                source: 'agent_gateway',
                data: {
                  sessionId: signal.sessionId,
                  draftId: signal.draftId,
                  role: signal.role,
                  failed: signal.result.failed,
                  selectedProvider: signal.result.selectedProvider,
                  attempts: signal.result.attempts,
                  output: signal.result.output,
                },
              };
              realtime.broadcast(
                `session:${signal.sessionId}`,
                'agent_gateway_orchestration_step',
                payload,
              );
              realtime.broadcast(
                `post:${signal.draftId}`,
                'agent_gateway_orchestration_step',
                payload,
              );
              realtime.broadcast(
                'feed:live',
                'agent_gateway_orchestration_step',
                payload,
              );
            }
          : undefined,
        onCompleted: realtime
          ? (signal) => {
              const payload = {
                source: 'agent_gateway',
                data: {
                  sessionId: signal.sessionId,
                  draftId: signal.draftId,
                  completed: signal.completed,
                  stepCount: signal.stepCount,
                },
              };
              realtime.broadcast(
                `session:${signal.sessionId}`,
                'agent_gateway_orchestration_completed',
                payload,
              );
              realtime.broadcast(
                `post:${signal.draftId}`,
                'agent_gateway_orchestration_completed',
                payload,
              );
              realtime.broadcast(
                'feed:live',
                'agent_gateway_orchestration_completed',
                payload,
              );
            }
          : undefined,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/agent-gateway/sessions',
  requireAdmin,
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(req.query, {
        allowed: [
          'source',
          'limit',
          'channel',
          'provider',
          'connector',
          'status',
        ],
        endpoint: '/api/admin/agent-gateway/sessions',
      });
      const source = parseAgentGatewaySourceQuery(query.source);
      const limit = parseBoundedQueryInt(query.limit, {
        fieldName: 'limit',
        defaultValue: 50,
        min: 1,
        max: 200,
      });
      const channelFilter = parseOptionalGatewayChannelQueryString(
        query.channel,
        {
          fieldName: 'channel',
        },
      );
      const providerFilter = parseOptionalProviderIdentifierQueryString(
        query.provider,
        {
          fieldName: 'provider',
        },
      );
      const connectorFilter = parseOptionalGatewayConnectorIdQueryString(
        query.connector,
        {
          fieldName: 'connector',
        },
      );
      const statusFilter = parseOptionalGatewaySessionStatusQuery(
        query.status,
        {
          fieldName: 'status',
        },
      );
      const sessions =
        source === 'memory'
          ? agentGatewayService.listSessions(limit, {
              channel: channelFilter,
              provider: providerFilter,
              connector: connectorFilter,
              status: statusFilter,
            })
          : await agentGatewayService.listPersistedSessions(limit, {
              channel: channelFilter,
              provider: providerFilter,
              connector: connectorFilter,
              status: statusFilter,
            });
      res.json({
        source,
        filters: {
          channel: channelFilter,
          provider: providerFilter,
          connector: connectorFilter,
          status: statusFilter,
        },
        sessions,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/agent-gateway/telemetry',
  requireAdmin,
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['hours', 'limit', 'channel', 'provider', 'connector'],
        endpoint: '/api/admin/agent-gateway/telemetry',
      });

      const hours = parseBoundedQueryInt(query.hours, {
        fieldName: 'hours',
        defaultValue: 24,
        min: 1,
        max: 720,
      });
      const limit = parseBoundedQueryInt(query.limit, {
        fieldName: 'limit',
        defaultValue: 200,
        min: 1,
        max: 1000,
      });
      const channelFilter = parseOptionalGatewayChannelQueryString(
        query.channel,
        {
          fieldName: 'channel',
        },
      );
      const providerFilter = parseOptionalProviderIdentifierQueryString(
        query.provider,
        {
          fieldName: 'provider',
        },
      );
      const connectorFilter = parseOptionalGatewayConnectorIdQueryString(
        query.connector,
        {
          fieldName: 'connector',
        },
      );

      const sessionsResult = await db.query(
        `SELECT
           id,
           status,
           channel,
           updated_at
         FROM agent_gateway_sessions
         WHERE
           updated_at >= NOW() - ($1 || ' hours')::interval
           AND ($3::text IS NULL OR channel = $3)
           AND (
             $4::text IS NULL OR EXISTS (
               SELECT 1
               FROM agent_gateway_events connector_event_rows
               WHERE connector_event_rows.session_id = agent_gateway_sessions.id
                 AND LOWER(
                   COALESCE(
                     connector_event_rows.payload->>'connectorId',
                     ''
                   )
                 ) = $4
             )
           )
         ORDER BY updated_at DESC
         LIMIT $2`,
        [hours, limit, channelFilter, connectorFilter],
      );
      let sessionRows: AgentGatewayTelemetrySessionRow[] =
        sessionsResult.rows.map((row) => ({
          id: String(row.id ?? ''),
          status: String(row.status ?? 'unknown'),
          channel: String(row.channel ?? 'unknown'),
          updatedAt: String(row.updated_at ?? ''),
        }));
      const sessionIds = sessionRows
        .map((row) => row.id)
        .filter((id) => id.length > 0);

      const eventRows: AgentGatewayTelemetryEventRow[] =
        sessionIds.length > 0
          ? (
              await db.query(
                `SELECT
                   session_id,
                   event_type,
                   payload,
                   created_at
                 FROM agent_gateway_events
                 WHERE session_id = ANY($1::text[])
                   AND (
                     $2::text IS NULL OR
                     LOWER(COALESCE(payload->>'selectedProvider', '')) = $2
                   )
                   AND (
                     $3::text IS NULL OR
                     LOWER(COALESCE(payload->>'connectorId', '')) = $3
                   )
                 ORDER BY created_at DESC`,
                [sessionIds, providerFilter, connectorFilter],
              )
            ).rows.map((row) => ({
              sessionId: String(row.session_id ?? ''),
              type: String(row.event_type ?? ''),
              payload: toGatewayEventPayload(row.payload),
              createdAt: String(row.created_at ?? ''),
            }))
          : [];
      const adapterRows: AgentGatewayAdapterTelemetryRow[] = (
        await db.query(
          `SELECT
             LOWER(COALESCE(metadata->>'adapter', 'unknown')) AS adapter,
             event_type,
             COUNT(*)::int AS count,
             MAX(created_at) AS last_seen_at
           FROM ux_events
           WHERE source = 'agent_gateway_adapter'
             AND event_type IN (
               $4::text,
               $5::text
             )
             AND created_at >= NOW() - ($1 || ' hours')::interval
             AND ($2::text IS NULL OR LOWER(COALESCE(metadata->>'channel', '')) = $2)
             AND (
               $3::text IS NULL OR
               LOWER(COALESCE(metadata->>'selectedProvider', '')) = $3 OR
               LOWER(COALESCE(metadata->>'provider', '')) = $3
             )
           GROUP BY LOWER(COALESCE(metadata->>'adapter', 'unknown')), event_type`,
          [
            hours,
            channelFilter,
            providerFilter,
            AGENT_GATEWAY_ADAPTER_ROUTE_SUCCESS_EVENT,
            AGENT_GATEWAY_ADAPTER_ROUTE_FAILED_EVENT,
          ],
        )
      ).rows.map((row) => ({
        adapter: String(row.adapter ?? 'unknown'),
        eventType: String(row.event_type ?? ''),
        count: toNumber(row.count),
        lastSeenAt: toNullableIsoTimestamp(row.last_seen_at),
      }));
      const ingestRows: AgentGatewayIngestTelemetryRow[] = (
        await db.query(
          `SELECT
             LOWER(COALESCE(metadata->>'connectorId', 'unknown')) AS connector_id,
             LOWER(COALESCE(metadata->>'connectorRiskLevel', 'unknown')) AS connector_risk_level,
             event_type,
             LOWER(NULLIF(metadata->>'code', '')) AS error_code,
             COUNT(*)::int AS count,
             MAX(created_at) AS last_seen_at
           FROM ux_events
           WHERE source = 'agent_gateway_ingest'
             AND event_type IN ($5::text, $6::text, $7::text)
             AND created_at >= NOW() - ($1 || ' hours')::interval
             AND ($2::text IS NULL OR LOWER(COALESCE(metadata->>'channel', '')) = $2)
             AND (
               $3::text IS NULL OR
               LOWER(COALESCE(metadata->>'provider', '')) = $3 OR
               LOWER(COALESCE(metadata->>'selectedProvider', '')) = $3
             )
             AND (
               $4::text IS NULL OR
               LOWER(COALESCE(metadata->>'connectorId', '')) = $4
             )
           GROUP BY
             LOWER(COALESCE(metadata->>'connectorId', 'unknown')),
             LOWER(COALESCE(metadata->>'connectorRiskLevel', 'unknown')),
             event_type,
             LOWER(NULLIF(metadata->>'code', ''))`,
          [
            hours,
            channelFilter,
            providerFilter,
            connectorFilter,
            AGENT_GATEWAY_INGEST_ACCEPT_EVENT,
            AGENT_GATEWAY_INGEST_REPLAY_EVENT,
            AGENT_GATEWAY_INGEST_REJECT_EVENT,
          ],
        )
      ).rows.map((row) => ({
        connectorId: String(row.connector_id ?? 'unknown'),
        connectorRiskLevel:
          typeof row.connector_risk_level === 'string'
            ? row.connector_risk_level
            : null,
        eventType: String(row.event_type ?? ''),
        errorCode:
          typeof row.error_code === 'string' && row.error_code.length > 0
            ? row.error_code
            : null,
        count: toNumber(row.count),
        lastSeenAt: toNullableIsoTimestamp(row.last_seen_at),
      }));
      if (providerFilter || connectorFilter) {
        const sessionIdsWithFilteredEvents = new Set(
          eventRows.map((row) => row.sessionId),
        );
        sessionRows = sessionRows.filter((row) =>
          sessionIdsWithFilteredEvents.has(row.id),
        );
      }
      const snapshot = buildAgentGatewayTelemetrySnapshot(
        sessionRows,
        eventRows,
        adapterRows,
        ingestRows,
      );

      res.json({
        windowHours: hours,
        sampleLimit: limit,
        generatedAt: new Date().toISOString(),
        sessions: snapshot.sessions,
        events: snapshot.events,
        health: snapshot.health,
        thresholds: snapshot.thresholds,
        filters: {
          channel: channelFilter,
          provider: providerFilter,
          connector: connectorFilter,
        },
        attempts: snapshot.attempts,
        providerUsage: snapshot.providerUsage,
        channelUsage: snapshot.channelUsage,
        adapters: snapshot.adapters,
        ingestConnectors: snapshot.ingestConnectors,
        connectorPolicies: buildAgentGatewayConnectorPolicySnapshot(),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/agent-gateway/adapters',
  requireAdmin,
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['hours', 'channel', 'provider', 'connector'],
        endpoint: '/api/admin/agent-gateway/adapters',
      });
      const hours = parseBoundedQueryInt(query.hours, {
        fieldName: 'hours',
        defaultValue: 24,
        min: 1,
        max: 720,
      });
      const channelFilter = parseOptionalGatewayChannelQueryString(
        query.channel,
        {
          fieldName: 'channel',
        },
      );
      const providerFilter = parseOptionalProviderIdentifierQueryString(
        query.provider,
        {
          fieldName: 'provider',
        },
      );
      const connectorFilter = parseOptionalGatewayConnectorIdQueryString(
        query.connector,
        {
          fieldName: 'connector',
        },
      );

      const adapterRows: AgentGatewayAdapterTelemetryRow[] = (
        await db.query(
          `SELECT
             LOWER(COALESCE(metadata->>'adapter', 'unknown')) AS adapter,
             event_type,
             COUNT(*)::int AS count,
             MAX(created_at) AS last_seen_at
           FROM ux_events
           WHERE source = 'agent_gateway_adapter'
             AND event_type IN ($4::text, $5::text)
             AND created_at >= NOW() - ($1 || ' hours')::interval
             AND ($2::text IS NULL OR LOWER(COALESCE(metadata->>'channel', '')) = $2)
             AND (
               $3::text IS NULL OR
               LOWER(COALESCE(metadata->>'selectedProvider', '')) = $3 OR
               LOWER(COALESCE(metadata->>'provider', '')) = $3
             )
           GROUP BY LOWER(COALESCE(metadata->>'adapter', 'unknown')), event_type`,
          [
            hours,
            channelFilter,
            providerFilter,
            AGENT_GATEWAY_ADAPTER_ROUTE_SUCCESS_EVENT,
            AGENT_GATEWAY_ADAPTER_ROUTE_FAILED_EVENT,
          ],
        )
      ).rows.map((row) => ({
        adapter: String(row.adapter ?? 'unknown'),
        eventType: String(row.event_type ?? ''),
        count: toNumber(row.count),
        lastSeenAt: toNullableIsoTimestamp(row.last_seen_at),
      }));
      const ingestRows: AgentGatewayIngestTelemetryRow[] = (
        await db.query(
          `SELECT
             LOWER(COALESCE(metadata->>'connectorId', 'unknown')) AS connector_id,
             LOWER(COALESCE(metadata->>'connectorRiskLevel', 'unknown')) AS connector_risk_level,
             event_type,
             LOWER(NULLIF(metadata->>'code', '')) AS error_code,
             COUNT(*)::int AS count,
             MAX(created_at) AS last_seen_at
           FROM ux_events
           WHERE source = 'agent_gateway_ingest'
             AND event_type IN ($5::text, $6::text, $7::text)
             AND created_at >= NOW() - ($1 || ' hours')::interval
             AND ($2::text IS NULL OR LOWER(COALESCE(metadata->>'channel', '')) = $2)
             AND (
               $3::text IS NULL OR
               LOWER(COALESCE(metadata->>'provider', '')) = $3 OR
               LOWER(COALESCE(metadata->>'selectedProvider', '')) = $3
             )
             AND (
               $4::text IS NULL OR
               LOWER(COALESCE(metadata->>'connectorId', '')) = $4
             )
           GROUP BY
             LOWER(COALESCE(metadata->>'connectorId', 'unknown')),
             LOWER(COALESCE(metadata->>'connectorRiskLevel', 'unknown')),
             event_type,
             LOWER(NULLIF(metadata->>'code', ''))`,
          [
            hours,
            channelFilter,
            providerFilter,
            connectorFilter,
            AGENT_GATEWAY_INGEST_ACCEPT_EVENT,
            AGENT_GATEWAY_INGEST_REPLAY_EVENT,
            AGENT_GATEWAY_INGEST_REJECT_EVENT,
          ],
        )
      ).rows.map((row) => ({
        connectorId: String(row.connector_id ?? 'unknown'),
        connectorRiskLevel:
          typeof row.connector_risk_level === 'string'
            ? row.connector_risk_level
            : null,
        eventType: String(row.event_type ?? ''),
        errorCode:
          typeof row.error_code === 'string' && row.error_code.length > 0
            ? row.error_code
            : null,
        count: toNumber(row.count),
        lastSeenAt: toNullableIsoTimestamp(row.last_seen_at),
      }));

      const adapters = buildAgentGatewayAdapterMetrics(adapterRows, {
        includeRegistry: true,
      });
      const ingestConnectors =
        buildAgentGatewayIngestConnectorMetrics(ingestRows);
      const connectorPolicies = buildAgentGatewayConnectorPolicySnapshot();
      res.json({
        windowHours: hours,
        generatedAt: new Date().toISOString(),
        filters: {
          channel: channelFilter,
          provider: providerFilter,
          connector: connectorFilter,
        },
        adapters,
        ingestConnectors,
        connectorPolicies,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/agent-gateway/sessions',
  requireAdmin,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(req.query, {
        allowed: [],
        endpoint: '/api/admin/agent-gateway/sessions',
      });
      const body = assertAllowedBodyFields(req.body, {
        allowed: [
          'channel',
          'draftId',
          'externalSessionId',
          'roles',
          'metadata',
        ],
        endpoint: '/api/admin/agent-gateway/sessions',
      });

      const channel = parseRequiredGatewayChannelBodyString(body.channel, {
        fieldName: 'channel',
      });
      const draftId =
        parseOptionalUuidBodyString(body.draftId, {
          fieldName: 'draftId',
        }) ?? null;
      const externalSessionId =
        parseOptionalGatewayExternalSessionIdBodyString(
          body.externalSessionId,
          {
            fieldName: 'externalSessionId',
          },
        ) ?? null;
      const roles = parseOptionalGatewayRolesBody(body.roles, {
        fieldName: 'roles',
        maxItems: 12,
        maxItemLength: 64,
      });
      const metadata = parseOptionalObjectBody(body.metadata, {
        fieldName: 'metadata',
      });

      const session = agentGatewayService.createSession({
        channel,
        externalSessionId,
        draftId,
        roles,
        metadata,
      });
      await agentGatewayService.persistSession(session);
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/agent-gateway/sessions/:sessionId',
  requireAdmin,
  async (req, res, next) => {
    try {
      const sessionId = parseAgentGatewaySessionIdParam(req.params.sessionId);
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['source'],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId',
      });
      const source = parseAgentGatewaySourceQuery(query.source);
      const detail =
        source === 'memory'
          ? agentGatewayService.getSession(sessionId)
          : await agentGatewayService.getPersistedSession(sessionId);
      if (!detail) {
        throw new ServiceError(
          'AGENT_GATEWAY_SESSION_NOT_FOUND',
          'Agent gateway session not found.',
          404,
        );
      }
      res.json(detail);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/agent-gateway/sessions/:sessionId/events',
  requireAdmin,
  async (req, res, next) => {
    try {
      const sessionId = parseAgentGatewaySessionIdParam(req.params.sessionId);
      const query = assertAllowedQueryFields(req.query, {
        allowed: [
          'source',
          'limit',
          'eventType',
          'eventQuery',
          'fromRole',
          'toRole',
          'provider',
          'connector',
        ],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/events',
      });
      const source = parseAgentGatewaySourceQuery(query.source);
      const eventTypeFilter = parseOptionalGatewayEventTypeQueryString(
        query.eventType,
        {
          fieldName: 'eventType',
        },
      );
      const eventQueryFilter = parseOptionalGatewayEventQueryString(
        query.eventQuery,
        {
          fieldName: 'eventQuery',
        },
      );
      const fromRoleFilter = parseOptionalGatewayRoleQueryString(
        query.fromRole,
        {
          fieldName: 'fromRole',
        },
      );
      const toRoleFilter = parseOptionalGatewayRoleQueryString(query.toRole, {
        fieldName: 'toRole',
      });
      const providerFilter = parseOptionalProviderIdentifierQueryString(
        query.provider,
        {
          fieldName: 'provider',
        },
      );
      const connectorFilter = parseOptionalGatewayConnectorIdQueryString(
        query.connector,
        {
          fieldName: 'connector',
        },
      );
      const limit = parseBoundedQueryInt(query.limit, {
        fieldName: 'limit',
        defaultValue: 10,
        min: 1,
        max: 200,
      });

      if (source === 'db') {
        const sessionResult = await db.query(
          `SELECT id, channel, draft_id, status, updated_at
           FROM agent_gateway_sessions
           WHERE id = $1
           LIMIT 1`,
          [sessionId],
        );
        if (sessionResult.rows.length === 0) {
          throw new ServiceError(
            'AGENT_GATEWAY_SESSION_NOT_FOUND',
            'Agent gateway session not found.',
            404,
          );
        }

        const eventFilterClauses: string[] = ['session_id = $1'];
        const eventFilterParams: unknown[] = [sessionId];

        if (eventTypeFilter) {
          eventFilterParams.push(eventTypeFilter);
          eventFilterClauses.push(`event_type = $${eventFilterParams.length}`);
        }
        if (fromRoleFilter) {
          eventFilterParams.push(fromRoleFilter);
          eventFilterClauses.push(`from_role = $${eventFilterParams.length}`);
        }
        if (toRoleFilter) {
          eventFilterParams.push(toRoleFilter);
          eventFilterClauses.push(
            `COALESCE(to_role, '') = $${eventFilterParams.length}`,
          );
        }
        if (providerFilter) {
          eventFilterParams.push(providerFilter);
          eventFilterClauses.push(
            `LOWER(COALESCE(payload->>'selectedProvider', payload->>'provider', '')) = $${eventFilterParams.length}`,
          );
        }
        if (connectorFilter) {
          eventFilterParams.push(connectorFilter);
          eventFilterClauses.push(
            `LOWER(COALESCE(payload->>'connectorId', '')) = $${eventFilterParams.length}`,
          );
        }
        if (eventQueryFilter) {
          eventFilterParams.push(eventQueryFilter);
          const eventQueryParamIndex = eventFilterParams.length;
          eventFilterClauses.push(
            `(
              POSITION($${eventQueryParamIndex} IN LOWER(event_type)) > 0
              OR POSITION($${eventQueryParamIndex} IN LOWER(from_role)) > 0
              OR POSITION($${eventQueryParamIndex} IN LOWER(COALESCE(to_role, ''))) > 0
            )`,
          );
        }

        const eventWhereClause = eventFilterClauses.join('\n             AND ');
        const totalResult = await db.query(
          `SELECT COUNT(*)::int AS total
           FROM agent_gateway_events
           WHERE ${eventWhereClause}`,
          eventFilterParams,
        );
        const eventQueryParams = [...eventFilterParams];
        eventQueryParams.push(limit);
        const limitParamIndex = eventQueryParams.length;
        const eventsResult = await db.query(
          `SELECT id,
                  session_id,
                  from_role,
                  to_role,
                  event_type,
                  payload,
                  created_at
           FROM agent_gateway_events
           WHERE ${eventWhereClause}
           ORDER BY created_at DESC, id DESC
           LIMIT $${limitParamIndex}`,
          eventQueryParams,
        );
        const events = eventsResult.rows.map((row) => ({
          id: String(row.id ?? ''),
          sessionId: String(row.session_id ?? ''),
          fromRole: String(row.from_role ?? ''),
          toRole:
            typeof row.to_role === 'string' && row.to_role.trim().length > 0
              ? row.to_role
              : null,
          type: String(row.event_type ?? ''),
          payload: toGatewayEventPayload(row.payload),
          createdAt:
            toNullableIsoTimestamp(row.created_at) ?? new Date().toISOString(),
        }));
        const sessionRow = sessionResult.rows[0] as Record<string, unknown>;

        res.json({
          source,
          session: {
            id: String(sessionRow.id ?? sessionId),
            channel: String(sessionRow.channel ?? ''),
            draftId:
              typeof sessionRow.draft_id === 'string' &&
              sessionRow.draft_id.length > 0
                ? sessionRow.draft_id
                : null,
            status:
              typeof sessionRow.status === 'string' &&
              sessionRow.status.toLowerCase() === 'closed'
                ? 'closed'
                : 'active',
            updatedAt:
              toNullableIsoTimestamp(sessionRow.updated_at) ??
              new Date().toISOString(),
          },
          filters: {
            eventType: eventTypeFilter,
            eventQuery: eventQueryFilter,
            fromRole: fromRoleFilter,
            toRole: toRoleFilter,
            provider: providerFilter,
            connector: connectorFilter,
          },
          total: toNumber(totalResult.rows[0]?.total),
          limit,
          events,
        });
        return;
      }

      const detail = agentGatewayService.getSession(sessionId);
      const filteredEvents = detail.events.filter((event) => {
        if (eventTypeFilter && event.type !== eventTypeFilter) {
          return false;
        }
        if (fromRoleFilter && event.fromRole !== fromRoleFilter) {
          return false;
        }
        if (toRoleFilter && (event.toRole ?? '') !== toRoleFilter) {
          return false;
        }
        if (providerFilter) {
          const eventProviderRaw =
            event.payload.selectedProvider ?? event.payload.provider;
          const eventProvider =
            typeof eventProviderRaw === 'string'
              ? eventProviderRaw.trim().toLowerCase()
              : '';
          if (eventProvider !== providerFilter) {
            return false;
          }
        }
        if (connectorFilter) {
          const eventConnectorRaw = event.payload.connectorId;
          const eventConnector =
            typeof eventConnectorRaw === 'string'
              ? eventConnectorRaw.trim().toLowerCase()
              : '';
          if (eventConnector !== connectorFilter) {
            return false;
          }
        }
        if (eventQueryFilter) {
          const normalizedType = event.type.toLowerCase();
          const normalizedFromRole = event.fromRole.toLowerCase();
          const normalizedToRole = (event.toRole ?? '').toLowerCase();
          const matchesQuery =
            normalizedType.includes(eventQueryFilter) ||
            normalizedFromRole.includes(eventQueryFilter) ||
            normalizedToRole.includes(eventQueryFilter);
          if (!matchesQuery) {
            return false;
          }
        }
        return true;
      });
      const events = [...filteredEvents]
        .sort((left, right) => {
          const leftTime = Date.parse(left.createdAt);
          const rightTime = Date.parse(right.createdAt);
          if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
            if (rightTime !== leftTime) {
              return rightTime - leftTime;
            }
            return right.id.localeCompare(left.id);
          }
          const byCreatedAt = right.createdAt.localeCompare(left.createdAt);
          if (byCreatedAt !== 0) {
            return byCreatedAt;
          }
          return right.id.localeCompare(left.id);
        })
        .slice(0, limit);

      res.json({
        source,
        session: {
          id: detail.session.id,
          channel: detail.session.channel,
          draftId: detail.session.draftId,
          status: detail.session.status,
          updatedAt: detail.session.updatedAt,
        },
        filters: {
          eventType: eventTypeFilter,
          eventQuery: eventQueryFilter,
          fromRole: fromRoleFilter,
          toRole: toRoleFilter,
          provider: providerFilter,
          connector: connectorFilter,
        },
        total: filteredEvents.length,
        limit,
        events,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/agent-gateway/sessions/:sessionId/summary',
  requireAdmin,
  async (req, res, next) => {
    try {
      const sessionId = parseAgentGatewaySessionIdParam(req.params.sessionId);
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['source'],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/summary',
      });
      const source = parseAgentGatewaySourceQuery(query.source);
      const detail =
        source === 'memory'
          ? agentGatewayService.getSession(sessionId)
          : await agentGatewayService.getPersistedSession(sessionId);
      if (!detail) {
        throw new ServiceError(
          'AGENT_GATEWAY_SESSION_NOT_FOUND',
          'Agent gateway session not found.',
          404,
        );
      }
      res.json({
        source,
        summary: buildAgentGatewaySessionSummary(detail),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/admin/agent-gateway/sessions/:sessionId/status',
  requireAdmin,
  async (req, res, next) => {
    try {
      const sessionId = parseAgentGatewaySessionIdParam(req.params.sessionId);
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['source'],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/status',
      });
      const source = parseAgentGatewaySourceQuery(query.source);
      const detail =
        source === 'memory'
          ? agentGatewayService.getSession(sessionId)
          : await agentGatewayService.getPersistedSession(sessionId);
      if (!detail) {
        throw new ServiceError(
          'AGENT_GATEWAY_SESSION_NOT_FOUND',
          'Agent gateway session not found.',
          404,
        );
      }
      res.json({
        source,
        status: buildAgentGatewaySessionStatus(detail),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/agent-gateway/sessions/:sessionId/events',
  requireAdmin,
  async (req, res, next) => {
    try {
      const sessionId = parseAgentGatewaySessionIdParam(req.params.sessionId);
      assertAllowedQueryFields(req.query, {
        allowed: [],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/events',
      });
      const body = assertAllowedBodyFields(req.body, {
        allowed: ['fromRole', 'toRole', 'type', 'payload'],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/events',
      });

      const fromRole = parseRequiredGatewayRoleBodyString(body.fromRole, {
        fieldName: 'fromRole',
      });
      const eventType = parseRequiredGatewayEventTypeBodyString(body.type, {
        fieldName: 'type',
      });
      const toRole = parseOptionalGatewayRoleBodyString(body.toRole, {
        fieldName: 'toRole',
      });
      const payload = parseOptionalObjectBody(body.payload, {
        fieldName: 'payload',
      });

      const event = agentGatewayService.appendEvent(sessionId, {
        fromRole,
        toRole,
        type: eventType,
        payload,
      });
      await agentGatewayService.persistEvent(event);
      const detail = agentGatewayService.getSession(sessionId);
      await agentGatewayService.persistSession(detail.session);

      getRealtime(req)?.broadcast(
        `session:${sessionId}`,
        'agent_gateway_event',
        {
          source: 'agent_gateway',
          data: event,
        },
      );

      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/agent-gateway/sessions/:sessionId/compact',
  requireAdmin,
  async (req, res, next) => {
    try {
      const sessionId = parseAgentGatewaySessionIdParam(req.params.sessionId);
      assertAllowedQueryFields(req.query, {
        allowed: [],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/compact',
      });
      const body = assertAllowedBodyFields(req.body, {
        allowed: ['keepRecent'],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/compact',
      });
      const keepRecent = parseBoundedOptionalInt(body.keepRecent, {
        fieldName: 'keepRecent',
        min: 1,
        max: AGENT_GATEWAY_MAX_KEEP_RECENT,
        invalidCode: 'ADMIN_INVALID_BODY',
      });

      const result = await agentGatewayService.compactSession(
        sessionId,
        keepRecent,
      );

      const realtime = getRealtime(req);
      realtime?.broadcast(
        `session:${sessionId}`,
        'agent_gateway_session_compacted',
        {
          source: 'agent_gateway',
          data: result,
        },
      );
      const draftId = result.session.draftId;
      if (draftId) {
        const compactPayload = {
          source: 'agent_gateway',
          data: {
            sessionId: result.session.id,
            draftId,
            keepRecent: result.keepRecent,
            prunedCount: result.prunedCount,
            totalBefore: result.totalBefore,
            totalAfter: result.totalAfter,
          },
        };
        realtime?.broadcast(
          `post:${draftId}`,
          'agent_gateway_session_compacted',
          compactPayload,
        );
        realtime?.broadcast(
          'feed:live',
          'agent_gateway_session_compacted',
          compactPayload,
        );
      }
      realtime?.broadcast(`session:${sessionId}`, 'agent_gateway_event', {
        source: 'agent_gateway',
        data: result.event,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/admin/agent-gateway/sessions/:sessionId/close',
  requireAdmin,
  async (req, res, next) => {
    try {
      const sessionId = parseAgentGatewaySessionIdParam(req.params.sessionId);
      assertAllowedQueryFields(req.query, {
        allowed: [],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/close',
      });
      assertAllowedBodyFields(req.body, {
        allowed: [],
        endpoint: '/api/admin/agent-gateway/sessions/:sessionId/close',
      });
      const session = agentGatewayService.closeSession(sessionId);
      await agentGatewayService.persistSession(session);

      getRealtime(req)?.broadcast(
        `session:${sessionId}`,
        'agent_gateway_session',
        {
          source: 'agent_gateway',
          data: {
            sessionId: session.id,
            status: session.status,
            updatedAt: session.updatedAt,
          },
        },
      );

      res.json({ session });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/admin/budgets/remaining', requireAdmin, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(req.query, {
      allowed: ['agentId', 'draftId', 'date'],
      endpoint: '/api/admin/budgets/remaining',
    });
    const agentId = parseOptionalUuidQueryString(query.agentId, {
      fieldName: 'agentId',
    });
    const draftId = parseOptionalUuidQueryString(query.draftId, {
      fieldName: 'draftId',
    });
    const dateValue = parseOptionalBoundedQueryString(query.date, {
      fieldName: 'date',
      maxLength: 40,
    });
    const date = parseDateParam(dateValue ?? undefined);
    const dateKey = getUtcDateKey(date);

    if (!(agentId || draftId)) {
      throw new ServiceError(
        'MISSING_TARGET',
        'agentId or draftId is required.',
        400,
      );
    }

    const response: BudgetRemainingPayload = { date: dateKey };

    if (agentId) {
      const counts = await budgetService.getActionBudget(agentId, {
        now: date,
      });
      response.agent = {
        id: agentId,
        counts,
        limits: ACTION_LIMITS,
        remaining: buildRemaining(counts, ACTION_LIMITS),
      };
    }

    if (draftId) {
      const counts = await budgetService.getEditBudget(draftId, { now: date });
      response.draft = {
        id: draftId,
        counts,
        limits: EDIT_LIMITS,
        remaining: buildRemaining(counts, EDIT_LIMITS),
      };
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/budgets/metrics', requireAdmin, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(req.query, {
      allowed: ['date'],
      endpoint: '/api/admin/budgets/metrics',
    });
    const dateValue = parseOptionalBoundedQueryString(query.date, {
      fieldName: 'date',
      maxLength: 40,
    });
    const date = parseDateParam(dateValue ?? undefined);
    const dateKey = getUtcDateKey(date);
    const keys = await redis.keys(`budget:*:${dateKey}`);

    const draftTotals = { pr: 0, major_pr: 0, fix_request: 0 };
    const agentTotals = { pr: 0, major_pr: 0, fix_request: 0 };
    let draftKeys = 0;
    let agentKeys = 0;

    for (const key of keys) {
      const data = await redis.hGetAll(key);
      const counts = toCounts(data);
      if (key.startsWith('budget:agent:')) {
        agentKeys += 1;
        agentTotals.pr += counts.pr;
        agentTotals.major_pr += counts.major_pr;
        agentTotals.fix_request += counts.fix_request;
      } else if (key.startsWith('budget:draft:')) {
        draftKeys += 1;
        draftTotals.pr += counts.pr;
        draftTotals.major_pr += counts.major_pr;
        draftTotals.fix_request += counts.fix_request;
      }
    }

    res.json({
      date: dateKey,
      keyCount: {
        draft: draftKeys,
        agent: agentKeys,
        total: keys.length,
      },
      totals: {
        draft: draftTotals,
        agent: agentTotals,
        combined: {
          pr: draftTotals.pr + agentTotals.pr,
          major_pr: draftTotals.major_pr + agentTotals.major_pr,
          fix_request: draftTotals.fix_request + agentTotals.fix_request,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/system/metrics', requireAdmin, async (req, res, next) => {
  try {
    assertAllowedQueryFields(req.query, {
      allowed: [],
      endpoint: '/api/admin/system/metrics',
    });

    const startedAt = Date.now();
    let dbOk = false;
    let dbLatencyMs: number | null = null;
    try {
      await db.query('SELECT 1');
      dbOk = true;
      dbLatencyMs = Date.now() - startedAt;
    } catch (_error) {
      dbOk = false;
    }

    const memory = process.memoryUsage();
    res.json({
      uptimeSeconds: process.uptime(),
      nodeVersion: process.version,
      jobsEnabled: env.JOBS_ENABLED === 'true',
      db: { ok: dbOk, latencyMs: dbLatencyMs },
      redis: { ok: redis.isOpen },
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/ux/metrics', requireAdmin, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(req.query, {
      allowed: ['hours', 'eventType'],
      endpoint: '/api/admin/ux/metrics',
    });
    const hours = parseBoundedQueryInt(query.hours, {
      fieldName: 'hours',
      defaultValue: 24,
      min: 1,
      max: 720,
    });
    const eventType = parseOptionalUxEventTypeQueryString(query.eventType, {
      fieldName: 'eventType',
    });
    const filters: string[] = [
      "created_at >= NOW() - ($1 || ' hours')::interval",
    ];
    const params: unknown[] = [hours];

    if (eventType) {
      params.push(eventType);
      filters.push(`event_type = $${params.length}`);
    }

    const summary = await db.query(
      `SELECT event_type,
              COUNT(*)::int AS count,
              AVG(timing_ms)::float AS avg_timing_ms,
              MAX(created_at) AS last_event_at
       FROM ux_events
       WHERE ${filters.join(' AND ')}
       GROUP BY event_type
       ORDER BY count DESC`,
      params,
    );

    res.json({ windowHours: hours, rows: summary.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/ux/similar-search', requireAdmin, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(req.query, {
      allowed: ['hours'],
      endpoint: '/api/admin/ux/similar-search',
    });
    const hours = parseBoundedQueryInt(query.hours, {
      fieldName: 'hours',
      defaultValue: 24,
      min: 1,
      max: 720,
    });
    const trackedEvents = [
      'similar_search_shown',
      'similar_search_empty',
      'similar_search_clicked',
      'similar_search_view',
      'search_performed',
      'search_result_open',
    ];

    const summary = await db.query(
      `SELECT COALESCE(metadata->>'profile', 'unknown') AS profile,
              COALESCE(metadata->>'mode', 'unknown') AS mode,
              event_type,
              COUNT(*)::int AS count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND event_type = ANY($2)
       GROUP BY profile, mode, event_type
       ORDER BY profile, mode, event_type`,
      [hours, trackedEvents],
    );

    const profileStats: Record<
      string,
      {
        profile: string;
        mode: string;
        shown: number;
        empty: number;
        clicked: number;
        view: number;
        performed: number;
        resultOpen: number;
        ctr: number | null;
        emptyRate: number | null;
        openRate: number | null;
      }
    > = {};

    for (const row of summary.rows) {
      const profile = row.profile ?? 'unknown';
      const mode = row.mode ?? 'unknown';
      const key = `${profile}:${mode}`;
      let stats = profileStats[key];
      if (!stats) {
        stats = {
          profile,
          mode,
          shown: 0,
          empty: 0,
          clicked: 0,
          view: 0,
          performed: 0,
          resultOpen: 0,
          ctr: null,
          emptyRate: null,
          openRate: null,
        };
        profileStats[key] = stats;
      }

      switch (row.event_type) {
        case 'similar_search_shown':
          stats.shown += row.count;
          break;
        case 'similar_search_empty':
          stats.empty += row.count;
          break;
        case 'similar_search_clicked':
          stats.clicked += row.count;
          break;
        case 'similar_search_view':
          stats.view += row.count;
          break;
        case 'search_performed':
          stats.performed += row.count;
          break;
        case 'search_result_open':
          stats.resultOpen += row.count;
          break;
        default:
          break;
      }
    }

    for (const stats of Object.values(profileStats)) {
      stats.ctr =
        stats.shown > 0
          ? Number((stats.clicked / stats.shown).toFixed(3))
          : null;
      stats.emptyRate =
        stats.shown > 0 ? Number((stats.empty / stats.shown).toFixed(3)) : null;
      stats.openRate =
        stats.performed > 0
          ? Number((stats.resultOpen / stats.performed).toFixed(3))
          : null;
    }

    const profiles = Object.values(profileStats).sort((a, b) => {
      if (a.profile !== b.profile) {
        return a.profile.localeCompare(b.profile);
      }
      return a.mode.localeCompare(b.mode);
    });

    const styleFusionTotalsResult = await db.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
         COUNT(*) FILTER (WHERE status = 'error')::int AS error_count,
         AVG(
           CASE
             WHEN status = 'success'
               AND COALESCE(metadata->>'sampleCount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
             THEN (metadata->>'sampleCount')::float
             ELSE NULL
           END
         )::float AS avg_sample_count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND event_type = 'style_fusion_generate'`,
      [hours],
    );
    const styleFusionErrorsResult = await db.query(
      `SELECT
         COALESCE(metadata->>'errorCode', 'unknown') AS error_code,
         COUNT(*)::int AS count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND event_type = 'style_fusion_generate'
         AND status = 'error'
       GROUP BY error_code
       ORDER BY count DESC, error_code ASC`,
      [hours],
    );
    const styleFusionCopyTotalsResult = await db.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (
           WHERE COALESCE(metadata->>'status', 'unknown') = 'success'
         )::int AS success_count,
         COUNT(*) FILTER (
           WHERE COALESCE(metadata->>'status', 'unknown') IN ('failed', 'error')
         )::int AS error_count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND event_type = 'style_fusion_copy_brief'`,
      [hours],
    );
    const styleFusionCopyErrorsResult = await db.query(
      `SELECT
         COALESCE(metadata->>'errorCode', 'unknown') AS error_code,
         COUNT(*)::int AS count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND event_type = 'style_fusion_copy_brief'
         AND COALESCE(metadata->>'status', 'unknown') IN ('failed', 'error')
       GROUP BY error_code
       ORDER BY count DESC, error_code ASC`,
      [hours],
    );
    const styleFusionTotals = styleFusionTotalsResult.rows[0] ?? {};
    const totalCount = Number(styleFusionTotals.total_count ?? 0);
    const successCount = Number(styleFusionTotals.success_count ?? 0);
    const errorCount = Number(styleFusionTotals.error_count ?? 0);
    const avgSampleCountRaw = Number(styleFusionTotals.avg_sample_count ?? 0);
    const avgSampleCount =
      Number.isFinite(avgSampleCountRaw) && avgSampleCountRaw > 0
        ? Number(avgSampleCountRaw.toFixed(2))
        : null;
    const successRate =
      totalCount > 0 ? Number((successCount / totalCount).toFixed(3)) : null;
    const styleFusionCopyTotals = styleFusionCopyTotalsResult.rows[0] ?? {};
    const copyTotalCount = Number(styleFusionCopyTotals.total_count ?? 0);
    const copySuccessCount = Number(styleFusionCopyTotals.success_count ?? 0);
    const copyErrorCount = Number(styleFusionCopyTotals.error_count ?? 0);
    const copySuccessRate =
      copyTotalCount > 0
        ? Number((copySuccessCount / copyTotalCount).toFixed(3))
        : null;

    res.json({
      windowHours: hours,
      rows: summary.rows,
      profiles,
      styleFusion: {
        total: totalCount,
        success: successCount,
        errors: errorCount,
        successRate,
        avgSampleCount,
        errorBreakdown: styleFusionErrorsResult.rows.map((row) => ({
          errorCode: row.error_code as string,
          count: Number(row.count ?? 0),
        })),
      },
      styleFusionCopy: {
        total: copyTotalCount,
        success: copySuccessCount,
        errors: copyErrorCount,
        successRate: copySuccessRate,
        errorBreakdown: styleFusionCopyErrorsResult.rows.map((row) => ({
          errorCode: row.error_code as string,
          count: Number(row.count ?? 0),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/admin/ux/observer-engagement',
  requireAdmin,
  async (req, res, next) => {
    try {
      const query = assertAllowedQueryFields(req.query, {
        allowed: ['hours'],
        endpoint: '/api/admin/ux/observer-engagement',
      });
      const hours = parseBoundedQueryInt(query.hours, {
        fieldName: 'hours',
        defaultValue: 24,
        min: 1,
        max: 720,
      });
      const trackedEvents = [
        'draft_arc_view',
        'draft_recap_view',
        'draft_multimodal_glowup_view',
        'draft_multimodal_glowup_empty',
        'draft_multimodal_glowup_error',
        'watchlist_follow',
        'watchlist_unfollow',
        'digest_open',
        'hot_now_open',
        'pr_prediction_submit',
        'pr_prediction_settle',
        'pr_prediction_result_view',
      ];
      const feedPreferenceEvents = [
        'feed_view_mode_change',
        'feed_view_mode_hint_dismiss',
        'feed_density_change',
      ];

      const totalsResult = await db.query(
        `SELECT event_type, COUNT(*)::int AS count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND user_type = 'observer'
         AND event_type = ANY($2)
       GROUP BY event_type`,
        [hours, trackedEvents],
      );

      const totals = {
        observerEvents: 0,
        observerUsers: 0,
        draftArcViews: 0,
        recapViews: 0,
        watchlistFollows: 0,
        watchlistUnfollows: 0,
        digestOpens: 0,
        hotNowOpens: 0,
        predictionSubmits: 0,
        predictionSettles: 0,
        predictionResultViews: 0,
        multimodalViews: 0,
        multimodalEmptyStates: 0,
        multimodalErrors: 0,
      };

      for (const row of totalsResult.rows) {
        const count = Number(row.count ?? 0);
        totals.observerEvents += count;
        switch (row.event_type) {
          case 'draft_arc_view':
            totals.draftArcViews += count;
            break;
          case 'draft_recap_view':
            totals.recapViews += count;
            break;
          case 'watchlist_follow':
            totals.watchlistFollows += count;
            break;
          case 'watchlist_unfollow':
            totals.watchlistUnfollows += count;
            break;
          case 'digest_open':
            totals.digestOpens += count;
            break;
          case 'hot_now_open':
            totals.hotNowOpens += count;
            break;
          case 'pr_prediction_submit':
            totals.predictionSubmits += count;
            break;
          case 'pr_prediction_settle':
            totals.predictionSettles += count;
            break;
          case 'pr_prediction_result_view':
            totals.predictionResultViews += count;
            break;
          case 'draft_multimodal_glowup_view':
            totals.multimodalViews += count;
            break;
          case 'draft_multimodal_glowup_empty':
            totals.multimodalEmptyStates += count;
            break;
          case 'draft_multimodal_glowup_error':
            totals.multimodalErrors += count;
            break;
          default:
            break;
        }
      }

      const multimodalProviderRows = await db.query(
        `SELECT COALESCE(metadata->>'provider', 'unknown') AS provider,
                COUNT(*)::int AS count
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'observer'
           AND event_type = 'draft_multimodal_glowup_view'
         GROUP BY provider
         ORDER BY count DESC, provider`,
        [hours],
      );

      const multimodalReasonRows = await db.query(
        `SELECT event_type,
                COALESCE(metadata->>'reason', 'unknown') AS reason,
                COUNT(*)::int AS count
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'observer'
           AND event_type = ANY($2)
         GROUP BY event_type, reason
         ORDER BY event_type, count DESC, reason`,
        [
          hours,
          ['draft_multimodal_glowup_empty', 'draft_multimodal_glowup_error'],
        ],
      );
      const multimodalGuardrailRows = await db.query(
        `SELECT COALESCE(metadata->>'reason', 'unknown') AS reason,
                COUNT(*)::int AS count
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'system'
           AND source = 'api'
           AND event_type = 'draft_multimodal_glowup_error'
         GROUP BY reason
         ORDER BY count DESC, reason`,
        [hours],
      );
      const multimodalHourlyRows = await db.query(
        `SELECT
           TO_CHAR(
             DATE_TRUNC('hour', created_at AT TIME ZONE 'UTC'),
             'YYYY-MM-DD"T"HH24:00:00"Z"'
           ) AS hour_bucket,
           event_type,
           COUNT(*)::int AS count
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'observer'
           AND event_type = ANY($2)
         GROUP BY hour_bucket, event_type
         ORDER BY hour_bucket ASC, event_type`,
        [
          hours,
          [
            'draft_multimodal_glowup_view',
            'draft_multimodal_glowup_empty',
            'draft_multimodal_glowup_error',
          ],
        ],
      );

      const multimodalProviderBreakdown = multimodalProviderRows.rows.map(
        (row) => ({
          provider: String(row.provider ?? 'unknown'),
          count: Number(row.count ?? 0),
        }),
      );
      const multimodalEmptyReasonBreakdown = multimodalReasonRows.rows
        .filter((row) => row.event_type === 'draft_multimodal_glowup_empty')
        .map((row) => ({
          reason: String(row.reason ?? 'unknown'),
          count: Number(row.count ?? 0),
        }));
      const multimodalErrorReasonBreakdown = multimodalReasonRows.rows
        .filter((row) => row.event_type === 'draft_multimodal_glowup_error')
        .map((row) => ({
          reason: String(row.reason ?? 'unknown'),
          count: Number(row.count ?? 0),
        }));
      const multimodalInvalidQueryErrors = multimodalGuardrailRows.rows.reduce(
        (sum, row) =>
          String(row.reason ?? 'unknown') === 'invalid_query'
            ? sum + Number(row.count ?? 0)
            : sum,
        0,
      );
      const multimodalHourlyTrendMap = new Map<
        string,
        {
          hour: string;
          views: number;
          emptyStates: number;
          errors: number;
        }
      >();
      for (const row of multimodalHourlyRows.rows) {
        const hour = String(row.hour_bucket ?? '').trim();
        if (hour.length === 0) {
          continue;
        }
        const count = Number(row.count ?? 0);
        const current = multimodalHourlyTrendMap.get(hour) ?? {
          hour,
          views: 0,
          emptyStates: 0,
          errors: 0,
        };
        if (row.event_type === 'draft_multimodal_glowup_view') {
          current.views += count;
        } else if (row.event_type === 'draft_multimodal_glowup_empty') {
          current.emptyStates += count;
        } else if (row.event_type === 'draft_multimodal_glowup_error') {
          current.errors += count;
        }
        multimodalHourlyTrendMap.set(hour, current);
      }
      const multimodalHourlyTrend = Array.from(
        multimodalHourlyTrendMap.values(),
      )
        .sort((left, right) => left.hour.localeCompare(right.hour))
        .map((bucket) => {
          const attempts = bucket.views + bucket.emptyStates;
          const totalEvents = attempts + bucket.errors;
          return {
            hour: bucket.hour,
            views: bucket.views,
            emptyStates: bucket.emptyStates,
            errors: bucket.errors,
            attempts,
            totalEvents,
            coverageRate: toRate(bucket.views, attempts),
            errorRate: toRate(bucket.errors, totalEvents),
          };
        });

      const observerUsersResult = await db.query(
        `SELECT COUNT(DISTINCT user_id)::int AS observer_users
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND user_type = 'observer'
         AND user_id IS NOT NULL`,
        [hours],
      );
      totals.observerUsers = Number(
        observerUsersResult.rows[0]?.observer_users ?? 0,
      );

      const sessionsResult = await db.query(
        `WITH observer_events AS (
         SELECT user_id, created_at
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'observer'
           AND user_id IS NOT NULL
       ),
       sequenced AS (
         SELECT user_id,
                created_at,
                LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at) AS previous_at
         FROM observer_events
       ),
       session_flags AS (
         SELECT user_id,
                created_at,
                CASE
                  WHEN previous_at IS NULL OR created_at - previous_at > INTERVAL '30 minutes' THEN 1
                  ELSE 0
                END AS is_new_session
         FROM sequenced
       ),
       sessionized AS (
         SELECT user_id,
                created_at,
                SUM(is_new_session) OVER (
                  PARTITION BY user_id
                  ORDER BY created_at
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS session_id
         FROM session_flags
       ),
       session_durations AS (
         SELECT user_id,
                session_id,
                GREATEST(EXTRACT(EPOCH FROM MAX(created_at) - MIN(created_at)), 0)::float AS duration_sec
         FROM sessionized
         GROUP BY user_id, session_id
       )
       SELECT COUNT(*)::int AS session_count,
              AVG(duration_sec)::float AS avg_session_sec
       FROM session_durations`,
        [hours],
      );
      const sessionCount = Number(sessionsResult.rows[0]?.session_count ?? 0);
      const avgSessionSecRaw = Number(
        sessionsResult.rows[0]?.avg_session_sec ?? 0,
      );

      const retentionResult = await db.query(
        `WITH current_users AS (
         SELECT DISTINCT user_id
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'observer'
           AND user_id IS NOT NULL
       ),
       retention AS (
         SELECT cu.user_id,
                EXISTS(
                  SELECT 1
                  FROM ux_events ue
                  WHERE ue.user_type = 'observer'
                    AND ue.user_id = cu.user_id
                    AND ue.created_at >= NOW() - ($1 || ' hours')::interval - INTERVAL '24 hours'
                    AND ue.created_at < NOW() - ($1 || ' hours')::interval
                ) AS active_prev_24h,
                EXISTS(
                  SELECT 1
                  FROM ux_events ue
                  WHERE ue.user_type = 'observer'
                    AND ue.user_id = cu.user_id
                    AND ue.created_at >= NOW() - ($1 || ' hours')::interval - INTERVAL '7 days'
                    AND ue.created_at < NOW() - ($1 || ' hours')::interval
                ) AS active_prev_7d
         FROM current_users cu
       )
       SELECT COUNT(*)::int AS total_users,
              COALESCE(SUM(CASE WHEN active_prev_24h THEN 1 ELSE 0 END), 0)::int AS return_24h_users,
              COALESCE(SUM(CASE WHEN active_prev_7d THEN 1 ELSE 0 END), 0)::int AS return_7d_users
       FROM retention`,
        [hours],
      );
      const retentionTotalUsers = Number(
        retentionResult.rows[0]?.total_users ?? 0,
      );
      const return24hUsers = Number(
        retentionResult.rows[0]?.return_24h_users ?? 0,
      );
      const return7dUsers = Number(
        retentionResult.rows[0]?.return_7d_users ?? 0,
      );

      const segmentRows = await db.query(
        `SELECT COALESCE(metadata->>'mode', 'unknown') AS mode,
              COALESCE(status, metadata->>'draftStatus', metadata->>'status', 'unknown') AS draft_status,
              event_type,
              COUNT(*)::int AS count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND user_type = 'observer'
         AND event_type = ANY($2)
       GROUP BY mode, draft_status, event_type
       ORDER BY mode, draft_status, event_type`,
        [hours, trackedEvents],
      );

      const variantRows = await db.query(
        `SELECT COALESCE(
                metadata->>'abVariant',
                metadata->>'rankingVariant',
                metadata->>'digestVariant',
                'unknown'
              ) AS variant,
              event_type,
              COUNT(*)::int AS count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND user_type = 'observer'
         AND event_type = ANY($2)
       GROUP BY variant, event_type
       ORDER BY variant, event_type`,
        [hours, trackedEvents],
      );

      const feedPreferenceRows = await db.query(
        `SELECT event_type,
              COALESCE(
                CASE
                  WHEN event_type = 'feed_view_mode_change' THEN metadata->>'mode'
                  WHEN event_type = 'feed_view_mode_hint_dismiss' THEN metadata->>'mode'
                  WHEN event_type = 'feed_density_change' THEN metadata->>'density'
                  ELSE NULL
                END,
                'unknown'
              ) AS value,
              COALESCE(source, 'unknown') AS source_value,
              COUNT(*)::int AS count
       FROM ux_events
       WHERE created_at >= NOW() - ($1 || ' hours')::interval
         AND user_type = 'observer'
         AND event_type = ANY($2)
       GROUP BY event_type, value, source_value
       ORDER BY event_type, value, source_value`,
        [hours, feedPreferenceEvents],
      );

      const feedPreferenceTotals = {
        viewMode: {
          observer: 0,
          focus: 0,
          unknown: 0,
          total: 0,
        },
        density: {
          comfort: 0,
          compact: 0,
          unknown: 0,
          total: 0,
        },
        hint: {
          dismissCount: 0,
          switchCount: 0,
          totalInteractions: 0,
        },
      };

      for (const row of feedPreferenceRows.rows) {
        const eventType = String(row.event_type ?? '');
        const value = String(row.value ?? 'unknown');
        const sourceValue = String(row.source_value ?? 'unknown');
        const count = Number(row.count ?? 0);

        if (eventType === 'feed_view_mode_change') {
          if (value === 'observer') {
            feedPreferenceTotals.viewMode.observer += count;
          } else if (value === 'focus') {
            feedPreferenceTotals.viewMode.focus += count;
          } else {
            feedPreferenceTotals.viewMode.unknown += count;
          }
          feedPreferenceTotals.viewMode.total += count;
          if (sourceValue === 'hint') {
            feedPreferenceTotals.hint.switchCount += count;
          }
          continue;
        }

        if (eventType === 'feed_view_mode_hint_dismiss') {
          feedPreferenceTotals.hint.dismissCount += count;
          continue;
        }

        if (eventType === 'feed_density_change') {
          if (value === 'comfort') {
            feedPreferenceTotals.density.comfort += count;
          } else if (value === 'compact') {
            feedPreferenceTotals.density.compact += count;
          } else {
            feedPreferenceTotals.density.unknown += count;
          }
          feedPreferenceTotals.density.total += count;
        }
      }

      feedPreferenceTotals.hint.totalInteractions =
        feedPreferenceTotals.hint.dismissCount +
        feedPreferenceTotals.hint.switchCount;

      const viewModeObserverRate = toRate(
        feedPreferenceTotals.viewMode.observer,
        feedPreferenceTotals.viewMode.total,
      );
      const viewModeFocusRate = toRate(
        feedPreferenceTotals.viewMode.focus,
        feedPreferenceTotals.viewMode.total,
      );
      const densityComfortRate = toRate(
        feedPreferenceTotals.density.comfort,
        feedPreferenceTotals.density.total,
      );
      const densityCompactRate = toRate(
        feedPreferenceTotals.density.compact,
        feedPreferenceTotals.density.total,
      );
      const hintDismissRate = toRate(
        feedPreferenceTotals.hint.dismissCount,
        feedPreferenceTotals.hint.totalInteractions,
      );

      const predictionMarketSummary = await db.query(
        `SELECT
           COUNT(*)::int AS prediction_count,
           COUNT(DISTINCT observer_id)::int AS predictor_count,
           COUNT(DISTINCT pull_request_id)::int AS market_count,
           COALESCE(SUM(stake_points), 0)::int AS stake_points,
           COALESCE(SUM(payout_points), 0)::int AS payout_points,
           COALESCE(AVG(stake_points), 0)::float AS avg_stake_points,
           COUNT(*) FILTER (WHERE resolved_outcome IS NOT NULL)::int AS resolved_count,
           COUNT(*) FILTER (WHERE is_correct = true)::int AS correct_count
         FROM observer_pr_predictions
         WHERE created_at >= NOW() - ($1 || ' hours')::interval`,
        [hours],
      );
      const predictionOutcomes = await db.query(
        `SELECT
           predicted_outcome,
           COUNT(*)::int AS prediction_count,
           COALESCE(SUM(stake_points), 0)::int AS stake_points
         FROM observer_pr_predictions
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
         GROUP BY predicted_outcome
         ORDER BY predicted_outcome`,
        [hours],
      );
      const predictionHourlyRows = await db.query(
        `SELECT
           TO_CHAR(
             DATE_TRUNC('hour', created_at AT TIME ZONE 'UTC'),
             'YYYY-MM-DD"T"HH24:00:00"Z"'
           ) AS hour_bucket,
           COUNT(*)::int AS prediction_count,
           COUNT(DISTINCT observer_id)::int AS predictor_count,
           COUNT(DISTINCT pull_request_id)::int AS market_count,
           COALESCE(SUM(stake_points), 0)::int AS stake_points,
           COALESCE(SUM(payout_points), 0)::int AS payout_points,
           COALESCE(AVG(stake_points), 0)::float AS avg_stake_points,
           COUNT(*) FILTER (WHERE resolved_outcome IS NOT NULL)::int AS resolved_count,
           COUNT(*) FILTER (WHERE is_correct = true)::int AS correct_count
         FROM observer_pr_predictions
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
         GROUP BY hour_bucket
         ORDER BY hour_bucket ASC`,
        [hours],
      );
      const predictionResolutionWindowsResult = await db.query(
        `WITH resolved_predictions AS (
           SELECT
             observer_id,
             is_correct,
             stake_points,
             payout_points,
             COALESCE(resolved_at, created_at) AS resolved_timestamp
           FROM observer_pr_predictions
           WHERE resolved_outcome IS NOT NULL
         )
         SELECT
           COUNT(*) FILTER (
             WHERE resolved_timestamp >= NOW() - INTERVAL '7 days'
           )::int AS resolved_7d,
           COUNT(*) FILTER (
             WHERE resolved_timestamp >= NOW() - INTERVAL '7 days'
               AND is_correct = true
           )::int AS correct_7d,
           COUNT(DISTINCT observer_id) FILTER (
             WHERE resolved_timestamp >= NOW() - INTERVAL '7 days'
           )::int AS predictors_7d,
           COALESCE(
             SUM(
               CASE
                 WHEN resolved_timestamp >= NOW() - INTERVAL '7 days'
                   THEN payout_points - stake_points
                 ELSE 0
               END
             ),
             0
           )::int AS net_points_7d,
           COUNT(*) FILTER (
             WHERE resolved_timestamp >= NOW() - INTERVAL '30 days'
           )::int AS resolved_30d,
           COUNT(*) FILTER (
             WHERE resolved_timestamp >= NOW() - INTERVAL '30 days'
               AND is_correct = true
           )::int AS correct_30d,
           COUNT(DISTINCT observer_id) FILTER (
             WHERE resolved_timestamp >= NOW() - INTERVAL '30 days'
           )::int AS predictors_30d,
           COALESCE(
             SUM(
               CASE
                 WHEN resolved_timestamp >= NOW() - INTERVAL '30 days'
                   THEN payout_points - stake_points
                 ELSE 0
               END
             ),
             0
           )::int AS net_points_30d
         FROM resolved_predictions`,
      );
      const predictionFilterRows = await db.query(
        `SELECT
           COALESCE(metadata->>'scope', 'unknown') AS scope,
           COALESCE(metadata->>'filter', 'unknown') AS filter_value,
           COUNT(*)::int AS count
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'observer'
           AND event_type = 'observer_prediction_filter_change'
         GROUP BY scope, filter_value
         ORDER BY scope, filter_value`,
        [hours],
      );
      const predictionSortRows = await db.query(
        `SELECT
           COALESCE(metadata->>'scope', 'unknown') AS scope,
           COALESCE(metadata->>'sort', 'unknown') AS sort_value,
           COUNT(*)::int AS count
         FROM ux_events
         WHERE created_at >= NOW() - ($1 || ' hours')::interval
           AND user_type = 'observer'
           AND event_type = 'observer_prediction_sort_change'
         GROUP BY scope, sort_value
         ORDER BY scope, sort_value`,
        [hours],
      );

      const predictionCount = Number(
        predictionMarketSummary.rows[0]?.prediction_count ?? 0,
      );
      const predictorCount = Number(
        predictionMarketSummary.rows[0]?.predictor_count ?? 0,
      );
      const marketCount = Number(
        predictionMarketSummary.rows[0]?.market_count ?? 0,
      );
      const predictionStakePoints = Number(
        predictionMarketSummary.rows[0]?.stake_points ?? 0,
      );
      const predictionPayoutPoints = Number(
        predictionMarketSummary.rows[0]?.payout_points ?? 0,
      );
      const averageStakePoints = Number(
        Number(predictionMarketSummary.rows[0]?.avg_stake_points ?? 0).toFixed(
          2,
        ),
      );
      const predictionResolvedCount = Number(
        predictionMarketSummary.rows[0]?.resolved_count ?? 0,
      );
      const predictionCorrectCount = Number(
        predictionMarketSummary.rows[0]?.correct_count ?? 0,
      );
      const predictionParticipationRate = toRate(
        predictorCount,
        totals.observerUsers,
      );
      const predictionAccuracyRate = toRate(
        predictionCorrectCount,
        predictionResolvedCount,
      );
      const payoutToStakeRatio = toRate(
        predictionPayoutPoints,
        predictionStakePoints,
      );
      const predictionFilterByScopeMap = new Map<string, number>();
      const predictionFilterByFilterMap = new Map<string, number>();
      const predictionFilterByScopeAndFilter = predictionFilterRows.rows.map(
        (row) => {
          const scope = String(row.scope ?? 'unknown');
          const filter = String(row.filter_value ?? 'unknown');
          const count = Number(row.count ?? 0);
          predictionFilterByScopeMap.set(
            scope,
            (predictionFilterByScopeMap.get(scope) ?? 0) + count,
          );
          predictionFilterByFilterMap.set(
            filter,
            (predictionFilterByFilterMap.get(filter) ?? 0) + count,
          );
          return {
            scope,
            filter,
            count,
          };
        },
      );
      const predictionFilterTotalSwitches = predictionFilterByScopeAndFilter
        .map((row) => row.count)
        .reduce((sum, count) => sum + count, 0);
      const predictionFilterByScope = Array.from(
        predictionFilterByScopeMap.entries(),
      )
        .map(([scope, count]) => ({
          scope,
          count,
          rate: toRate(count, predictionFilterTotalSwitches),
        }))
        .sort(
          (left, right) =>
            right.count - left.count || left.scope.localeCompare(right.scope),
        );
      const predictionFilterByFilter = Array.from(
        predictionFilterByFilterMap.entries(),
      )
        .map(([filter, count]) => ({
          filter,
          count,
          rate: toRate(count, predictionFilterTotalSwitches),
        }))
        .sort(
          (left, right) =>
            right.count - left.count || left.filter.localeCompare(right.filter),
        );
      const predictionSortByScopeMap = new Map<string, number>();
      const predictionSortBySortMap = new Map<string, number>();
      const predictionSortByScopeAndSort = predictionSortRows.rows.map(
        (row) => {
          const scope = String(row.scope ?? 'unknown');
          const sort = String(row.sort_value ?? 'unknown');
          const count = Number(row.count ?? 0);
          predictionSortByScopeMap.set(
            scope,
            (predictionSortByScopeMap.get(scope) ?? 0) + count,
          );
          predictionSortBySortMap.set(
            sort,
            (predictionSortBySortMap.get(sort) ?? 0) + count,
          );
          return {
            scope,
            sort,
            count,
          };
        },
      );
      const predictionSortTotalSwitches = predictionSortByScopeAndSort
        .map((row) => row.count)
        .reduce((sum, count) => sum + count, 0);
      const predictionSortByScope = Array.from(
        predictionSortByScopeMap.entries(),
      )
        .map(([scope, count]) => ({
          scope,
          count,
          rate: toRate(count, predictionSortTotalSwitches),
        }))
        .sort(
          (left, right) =>
            right.count - left.count || left.scope.localeCompare(right.scope),
        );
      const predictionSortBySort = Array.from(predictionSortBySortMap.entries())
        .map(([sort, count]) => ({
          sort,
          count,
          rate: toRate(count, predictionSortTotalSwitches),
        }))
        .sort(
          (left, right) =>
            right.count - left.count || left.sort.localeCompare(right.sort),
        );
      const predictionHistoryControlSwitches =
        predictionFilterTotalSwitches + predictionSortTotalSwitches;
      const predictionSortSwitchShare = toRate(
        predictionSortTotalSwitches,
        predictionHistoryControlSwitches,
      );
      const predictionFilterSwitchShare = toRate(
        predictionFilterTotalSwitches,
        predictionHistoryControlSwitches,
      );
      const predictionSortNonDefaultSwitches = predictionSortByScopeAndSort
        .filter((row) => row.sort !== 'recent')
        .map((row) => row.count)
        .reduce((sum, count) => sum + count, 0);
      const predictionNonDefaultSortRate = toRate(
        predictionSortNonDefaultSwitches,
        predictionSortTotalSwitches,
      );
      const predictionHourlyTrend = predictionHourlyRows.rows
        .map((row) => {
          const hour = String(row.hour_bucket ?? '').trim();
          const predictions = Number(row.prediction_count ?? 0);
          const predictors = Number(row.predictor_count ?? 0);
          const markets = Number(row.market_count ?? 0);
          const stakePoints = Number(row.stake_points ?? 0);
          const payoutPoints = Number(row.payout_points ?? 0);
          const resolvedPredictions = Number(row.resolved_count ?? 0);
          const correctPredictions = Number(row.correct_count ?? 0);
          const avgStakePoints = Number(
            Number(row.avg_stake_points ?? 0).toFixed(2),
          );
          return {
            hour,
            predictions,
            predictors,
            markets,
            stakePoints,
            payoutPoints,
            avgStakePoints,
            resolvedPredictions,
            correctPredictions,
            accuracyRate: toRate(correctPredictions, resolvedPredictions),
            payoutToStakeRatio: toRate(payoutPoints, stakePoints),
          };
        })
        .filter((row) => row.hour.length > 0);
      const predictionResolved7d = Number(
        predictionResolutionWindowsResult.rows[0]?.resolved_7d ?? 0,
      );
      const predictionCorrect7d = Number(
        predictionResolutionWindowsResult.rows[0]?.correct_7d ?? 0,
      );
      const predictionPredictors7d = Number(
        predictionResolutionWindowsResult.rows[0]?.predictors_7d ?? 0,
      );
      const predictionNetPoints7d = Number(
        predictionResolutionWindowsResult.rows[0]?.net_points_7d ?? 0,
      );
      const predictionResolved30d = Number(
        predictionResolutionWindowsResult.rows[0]?.resolved_30d ?? 0,
      );
      const predictionCorrect30d = Number(
        predictionResolutionWindowsResult.rows[0]?.correct_30d ?? 0,
      );
      const predictionPredictors30d = Number(
        predictionResolutionWindowsResult.rows[0]?.predictors_30d ?? 0,
      );
      const predictionNetPoints30d = Number(
        predictionResolutionWindowsResult.rows[0]?.net_points_30d ?? 0,
      );
      const predictionWindowAccuracy7d = toRate(
        predictionCorrect7d,
        predictionResolved7d,
      );
      const predictionWindowAccuracy30d = toRate(
        predictionCorrect30d,
        predictionResolved30d,
      );
      const predictionWindow7dRiskLevel =
        predictionResolved7d <
        PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.minResolvedPredictions
          ? 'unknown'
          : resolveHealthLevel(
              predictionWindowAccuracy7d,
              PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate,
            );
      const predictionWindow30dRiskLevel =
        predictionResolved30d <
        PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.minResolvedPredictions
          ? 'unknown'
          : resolveHealthLevel(
              predictionWindowAccuracy30d,
              PREDICTION_RESOLUTION_WINDOW_THRESHOLDS.accuracyRate,
            );
      const multimodalAttempts =
        totals.multimodalViews + totals.multimodalEmptyStates;
      const multimodalTotalEvents =
        multimodalAttempts + totals.multimodalErrors;
      const multimodalCoverageRate = toRate(
        totals.multimodalViews,
        multimodalAttempts,
      );
      const multimodalErrorRate = toRate(
        totals.multimodalErrors,
        multimodalTotalEvents,
      );
      const multimodalErrorSignalsTotal =
        totals.multimodalErrors + multimodalInvalidQueryErrors;
      const multimodalInvalidQueryRate = toRate(
        multimodalInvalidQueryErrors,
        multimodalErrorSignalsTotal,
      );

      res.json({
        windowHours: hours,
        trackedEvents,
        feedPreferenceEvents,
        totals,
        kpis: {
          observerSessionTimeSec: Number(avgSessionSecRaw.toFixed(2)),
          sessionCount,
          followRate: toRate(totals.watchlistFollows, totals.draftArcViews),
          digestOpenRate: toRate(totals.digestOpens, totals.watchlistFollows),
          return24h: toRate(return24hUsers, retentionTotalUsers),
          return7d: toRate(return7dUsers, retentionTotalUsers),
          viewModeObserverRate,
          viewModeFocusRate,
          densityComfortRate,
          densityCompactRate,
          hintDismissRate,
          predictionParticipationRate,
          predictionAccuracyRate,
          predictionSettlementRate: toRate(
            totals.predictionSettles,
            totals.predictionSubmits,
          ),
          predictionFilterSwitchShare,
          predictionSortSwitchShare,
          predictionNonDefaultSortRate,
          predictionPoolPoints: predictionStakePoints,
          payoutToStakeRatio,
          multimodalCoverageRate,
          multimodalErrorRate,
        },
        multimodal: {
          views: totals.multimodalViews,
          emptyStates: totals.multimodalEmptyStates,
          errors: totals.multimodalErrors,
          attempts: multimodalAttempts,
          totalEvents: multimodalTotalEvents,
          coverageRate: multimodalCoverageRate,
          errorRate: multimodalErrorRate,
          providerBreakdown: multimodalProviderBreakdown,
          emptyReasonBreakdown: multimodalEmptyReasonBreakdown,
          errorReasonBreakdown: multimodalErrorReasonBreakdown,
          guardrails: {
            invalidQueryErrors: multimodalInvalidQueryErrors,
            invalidQueryRate: multimodalInvalidQueryRate,
          },
          hourlyTrend: multimodalHourlyTrend,
        },
        predictionMarket: {
          totals: {
            predictions: predictionCount,
            predictors: predictorCount,
            markets: marketCount,
            stakePoints: predictionStakePoints,
            payoutPoints: predictionPayoutPoints,
            averageStakePoints,
            resolvedPredictions: predictionResolvedCount,
            correctPredictions: predictionCorrectCount,
          },
          outcomes: predictionOutcomes.rows.map((row) => ({
            predictedOutcome: row.predicted_outcome,
            predictions: Number(row.prediction_count ?? 0),
            stakePoints: Number(row.stake_points ?? 0),
          })),
          hourlyTrend: predictionHourlyTrend,
          resolutionWindows: {
            d7: {
              days: 7,
              predictors: predictionPredictors7d,
              resolvedPredictions: predictionResolved7d,
              correctPredictions: predictionCorrect7d,
              accuracyRate: predictionWindowAccuracy7d,
              netPoints: predictionNetPoints7d,
              riskLevel: predictionWindow7dRiskLevel,
            },
            d30: {
              days: 30,
              predictors: predictionPredictors30d,
              resolvedPredictions: predictionResolved30d,
              correctPredictions: predictionCorrect30d,
              accuracyRate: predictionWindowAccuracy30d,
              netPoints: predictionNetPoints30d,
              riskLevel: predictionWindow30dRiskLevel,
            },
          },
          thresholds: {
            resolutionWindows: PREDICTION_RESOLUTION_WINDOW_THRESHOLDS,
          },
        },
        predictionFilterTelemetry: {
          totalSwitches: predictionFilterTotalSwitches,
          byScope: predictionFilterByScope,
          byFilter: predictionFilterByFilter,
          byScopeAndFilter: predictionFilterByScopeAndFilter,
        },
        predictionSortTelemetry: {
          totalSwitches: predictionSortTotalSwitches,
          byScope: predictionSortByScope,
          bySort: predictionSortBySort,
          byScopeAndSort: predictionSortByScopeAndSort,
        },
        feedPreferences: {
          viewMode: {
            ...feedPreferenceTotals.viewMode,
            observerRate: viewModeObserverRate,
            focusRate: viewModeFocusRate,
            unknownRate: toRate(
              feedPreferenceTotals.viewMode.unknown,
              feedPreferenceTotals.viewMode.total,
            ),
          },
          density: {
            ...feedPreferenceTotals.density,
            comfortRate: densityComfortRate,
            compactRate: densityCompactRate,
            unknownRate: toRate(
              feedPreferenceTotals.density.unknown,
              feedPreferenceTotals.density.total,
            ),
          },
          hint: {
            ...feedPreferenceTotals.hint,
            dismissRate: hintDismissRate,
          },
        },
        segments: segmentRows.rows.map((row) => ({
          mode: row.mode,
          draftStatus: row.draft_status,
          eventType: row.event_type,
          count: Number(row.count ?? 0),
        })),
        variants: variantRows.rows.map((row) => ({
          variant: row.variant,
          eventType: row.event_type,
          count: Number(row.count ?? 0),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/admin/cleanup/preview', requireAdmin, async (req, res, next) => {
  try {
    assertAllowedQueryFields(req.query, {
      allowed: [],
      endpoint: '/api/admin/cleanup/preview',
    });
    const counts = await privacyService.previewExpiredData();
    res.json({ counts });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/cleanup/run', requireAdmin, async (req, res, next) => {
  let startedAt: Date | null = null;
  try {
    const query = assertAllowedQueryFields(req.query, {
      allowed: ['confirm'],
      endpoint: '/api/admin/cleanup/run',
    });
    const body = assertAllowedBodyFields(req.body, {
      allowed: ['confirm'],
      endpoint: '/api/admin/cleanup/run',
    });

    const queryConfirm = parseOptionalBooleanFlag(query.confirm, {
      fieldName: 'confirm',
      invalidCode: 'ADMIN_INVALID_QUERY',
    });
    const bodyConfirm = parseOptionalBooleanFlag(body.confirm, {
      fieldName: 'confirm',
      invalidCode: 'ADMIN_INVALID_BODY',
    });

    if (
      queryConfirm !== undefined &&
      bodyConfirm !== undefined &&
      queryConfirm !== bodyConfirm
    ) {
      throw new ServiceError(
        'ADMIN_INPUT_CONFLICT',
        'confirm in query and body must match when both are provided.',
        400,
      );
    }

    const confirm = bodyConfirm ?? queryConfirm ?? false;
    if (!confirm) {
      throw new ServiceError(
        'CONFIRM_REQUIRED',
        'confirm=true is required to run cleanup.',
        400,
      );
    }

    startedAt = new Date();
    const counts = await privacyService.purgeExpiredData();
    await recordCleanupRun('manual_cleanup', 'success', startedAt, counts);
    res.json({ counts });
  } catch (error) {
    if (startedAt) {
      await recordCleanupRun(
        'manual_cleanup',
        'failed',
        startedAt,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
    next(error);
  }
});

router.get('/admin/jobs/metrics', requireAdmin, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(req.query, {
      allowed: ['hours'],
      endpoint: '/api/admin/jobs/metrics',
    });
    const hours = parseBoundedQueryInt(query.hours, {
      fieldName: 'hours',
      defaultValue: 24,
      min: 1,
      max: 720,
    });
    const summary = await db.query(
      `SELECT job_name,
              COUNT(*)::int AS total_runs,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::int AS success_count,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failure_count,
              AVG(duration_ms)::float AS avg_duration_ms,
              MAX(finished_at) AS last_run_at,
              (SELECT status FROM job_runs jr2 WHERE jr2.job_name = job_runs.job_name ORDER BY finished_at DESC LIMIT 1) AS last_status,
              (SELECT error_message FROM job_runs jr3 WHERE jr3.job_name = job_runs.job_name ORDER BY finished_at DESC LIMIT 1) AS last_error
       FROM job_runs
       WHERE started_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY job_name
       ORDER BY last_run_at DESC`,
      [hours],
    );

    res.json({ windowHours: hours, rows: summary.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/errors/metrics', requireAdmin, async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(req.query, {
      allowed: ['hours', 'limit', 'code', 'route'],
      endpoint: '/api/admin/errors/metrics',
    });

    const hours = parseBoundedQueryInt(query.hours, {
      fieldName: 'hours',
      defaultValue: 24,
      min: 1,
      max: 720,
    });
    const limit = parseBoundedQueryInt(query.limit, {
      fieldName: 'limit',
      defaultValue: 50,
      min: 1,
      max: 200,
    });
    const errorCode = parseOptionalErrorCodeQueryString(query.code, {
      fieldName: 'code',
      maxLength: 120,
    });
    const route = parseOptionalErrorRouteQueryString(query.route, {
      fieldName: 'route',
      maxLength: 240,
    });

    const filters: string[] = [
      "created_at >= NOW() - ($1 || ' hours')::interval",
    ];
    const params: unknown[] = [hours];

    if (errorCode) {
      params.push(errorCode);
      filters.push(`error_code = $${params.length}`);
    }

    if (route) {
      params.push(route);
      filters.push(`route = $${params.length}`);
    }

    params.push(limit);

    const summary = await db.query(
      `SELECT error_code,
              status,
              route,
              method,
              COUNT(*)::int AS count,
              MAX(created_at) AS last_event_at
       FROM error_events
       WHERE ${filters.join(' AND ')}
       GROUP BY error_code, status, route, method
       ORDER BY count DESC, last_event_at DESC
       LIMIT $${params.length}`,
      params,
    );

    res.json({ windowHours: hours, rows: summary.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
