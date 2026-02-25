import { type Request, Router } from 'express';
import { db } from '../db/pool';
import { logger } from '../logging/logger';
import {
  requireAgent,
  requireHuman,
  requireVerifiedAgent,
} from '../middleware/auth';
import {
  computeHeavyRateLimiter,
  observerActionRateLimiter,
} from '../middleware/security';
import { BudgetServiceImpl } from '../services/budget/budgetService';
import { ServiceError } from '../services/common/errors';
import { FixRequestServiceImpl } from '../services/fixRequest/fixRequestService';
import { MetricsServiceImpl } from '../services/metrics/metricsService';
import type { MultimodalGlowUpInput } from '../services/metrics/types';
import { NotificationServiceImpl } from '../services/notification/notificationService';
import { DraftArcServiceImpl } from '../services/observer/draftArcService';
import { PostServiceImpl } from '../services/post/postService';
import type { DraftStatus } from '../services/post/types';
import { ProvenanceServiceImpl } from '../services/provenance/provenanceService';
import { PullRequestServiceImpl } from '../services/pullRequest/pullRequestService';
import type { RealtimeService } from '../services/realtime/types';
import { SandboxServiceImpl } from '../services/sandbox/sandboxService';
import { EmbeddingServiceImpl } from '../services/search/embeddingService';
import { SearchServiceImpl } from '../services/search/searchService';

const router = Router();
const postService = new PostServiceImpl(db);
const fixService = new FixRequestServiceImpl(db);
const prService = new PullRequestServiceImpl(db);
const budgetService = new BudgetServiceImpl();
const sandboxService = new SandboxServiceImpl();
const metricsService = new MetricsServiceImpl(db);
const notificationService = new NotificationServiceImpl(db, async () =>
  Promise.resolve(),
);
const searchService = new SearchServiceImpl(db);
const embeddingService = new EmbeddingServiceImpl(db);
const draftArcService = new DraftArcServiceImpl(db);
const provenanceService = new ProvenanceServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAFT_STATUSES: DraftStatus[] = ['draft', 'release'];
const DRAFT_LIST_ALLOWED_QUERY_FIELDS = new Set([
  'status',
  'authorId',
  'limit',
  'offset',
]);
const DRAFT_LIST_MAX_LIMIT = 100;
const DRAFT_LIST_MAX_OFFSET = 10_000;
const DRAFT_CREATE_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_CREATE_ALLOWED_FIELDS = new Set([
  'imageUrl',
  'thumbnailUrl',
  'metadata',
]);
const DRAFT_DETAIL_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_PROVENANCE_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_PROVENANCE_EXPORT_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_ARC_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_RELEASE_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_RELEASE_ALLOWED_FIELDS = new Set<string>();
const DRAFT_FIX_REQUEST_CREATE_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_FIX_REQUEST_LIST_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_PULL_REQUEST_CREATE_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_PULL_REQUEST_LIST_QUERY_ALLOWED_FIELDS = new Set<string>();
const DRAFT_EMBEDDING_QUERY_ALLOWED_FIELDS = new Set<string>();
const FIX_REQUEST_ALLOWED_FIELDS = new Set([
  'category',
  'description',
  'coordinates',
]);
const FIX_REQUEST_CATEGORIES = new Set([
  'Focus',
  'Cohesion',
  'Readability',
  'Composition',
  'Color/Light',
  'Story/Intent',
  'Technical',
]);
const PULL_REQUEST_CREATE_ALLOWED_FIELDS = new Set([
  'description',
  'severity',
  'addressedFixRequests',
  'imageUrl',
  'thumbnailUrl',
]);
const PULL_REQUEST_SEVERITY_VALUES = new Set(['major', 'minor']);
const DRAFT_EMBEDDING_ALLOWED_FIELDS = new Set(['embedding', 'source']);
const PR_REVIEW_QUERY_ALLOWED_FIELDS = new Set<string>();
const PREDICTION_QUERY_ALLOWED_FIELDS = new Set<string>();
const PREDICTION_SUMMARY_QUERY_ALLOWED_FIELDS = new Set<string>();
const PR_DECISION_ALLOWED_FIELDS = new Set([
  'decision',
  'feedback',
  'rejectionReason',
]);
const PR_DECISION_QUERY_ALLOWED_FIELDS = new Set<string>();
const PR_FORK_QUERY_ALLOWED_FIELDS = new Set<string>();
const MULTIMODAL_WRITE_QUERY_ALLOWED_FIELDS = new Set<string>();
const MULTIMODAL_SCORE_MIN = 0;
const MULTIMODAL_SCORE_MAX = 100;

const getRealtime = (req: Request): RealtimeService | undefined => {
  return req.app.get('realtime');
};

// We only need a "looks like UUID" guard to catch obvious mistakes like "undefined".
// Keep it permissive so test fixtures and non-v4 UUIDs still pass validation.
const isUuid = (value: string) => UUID_PATTERN.test(value);

const parseOptionalScore = (
  value: unknown,
  fieldName: string,
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
      `${fieldName} must be a finite number.`,
      400,
    );
  }
  if (value < MULTIMODAL_SCORE_MIN || value > MULTIMODAL_SCORE_MAX) {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
      `${fieldName} must be between ${MULTIMODAL_SCORE_MIN} and ${MULTIMODAL_SCORE_MAX}.`,
      400,
    );
  }
  return value;
};

const parseDraftListInteger = (
  value: unknown,
  { field, min, max }: { field: string; min: number; max: number },
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!(Number.isFinite(parsed) && Number.isInteger(parsed))) {
    throw new ServiceError(
      'DRAFT_LIST_PAGINATION_INVALID',
      `${field} must be an integer.`,
      400,
    );
  }
  if (parsed < min || parsed > max) {
    throw new ServiceError(
      'DRAFT_LIST_PAGINATION_INVALID',
      `${field} must be between ${min} and ${max}.`,
      400,
    );
  }
  return parsed;
};

const assertAllowedQueryFields = (
  query: unknown,
  allowed: ReadonlySet<string>,
  errorCode: string,
  messagePrefix: string,
) => {
  const queryRecord =
    query && typeof query === 'object'
      ? (query as Record<string, unknown>)
      : {};
  const unknown = Object.keys(queryRecord).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `${messagePrefix}: ${unknown.join(', ')}.`,
      400,
    );
  }
};

const MULTIMODAL_ALLOWED_FIELDS = new Set([
  'provider',
  'visualScore',
  'narrativeScore',
  'audioScore',
  'videoScore',
]);

const MULTIMODAL_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

const parseMultimodalProvider = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
      'provider must be a string.',
      400,
    );
  }
  const provider = value.trim().toLowerCase();
  if (provider.length === 0 || !MULTIMODAL_PROVIDER_PATTERN.test(provider)) {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
      'provider must match /^[a-z0-9][a-z0-9._-]{0,63}$/i.',
      400,
    );
  }
  return provider;
};

const parseMultimodalPayload = (value: unknown): MultimodalGlowUpInput => {
  const payload =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  const unknownFields = Object.keys(payload).filter(
    (key) => !MULTIMODAL_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_FIELDS',
      `Unsupported multimodal fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  const visualScore = parseOptionalScore(payload.visualScore, 'visualScore');
  const narrativeScore = parseOptionalScore(
    payload.narrativeScore,
    'narrativeScore',
  );
  const audioScore = parseOptionalScore(payload.audioScore, 'audioScore');
  const videoScore = parseOptionalScore(payload.videoScore, 'videoScore');

  if (
    visualScore === undefined &&
    narrativeScore === undefined &&
    audioScore === undefined &&
    videoScore === undefined
  ) {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_INPUT',
      'At least one modality score must be provided.',
      400,
    );
  }

  return {
    provider: parseMultimodalProvider(payload.provider) ?? 'custom',
    visualScore,
    narrativeScore,
    audioScore,
    videoScore,
  };
};

const MULTIMODAL_QUERY_ALLOWED_FIELDS = new Set(['provider']);

const parseMultimodalQuery = (
  value: unknown,
): { provider?: string; queryKeys: string[] } => {
  const query =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const queryKeys = Object.keys(query);
  const unknownFields = queryKeys.filter(
    (key) => !MULTIMODAL_QUERY_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'MULTIMODAL_GLOWUP_INVALID_QUERY_FIELDS',
      `Unsupported multimodal query fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  const providerValue = Array.isArray(query.provider)
    ? query.provider[0]
    : query.provider;
  return {
    provider: parseMultimodalProvider(providerValue),
    queryKeys,
  };
};

const PREDICTION_ALLOWED_FIELDS = new Set([
  'predictedOutcome',
  'outcome',
  'stakePoints',
  'points',
]);
const PREDICTION_MIN_STAKE_POINTS = 5;
const PREDICTION_MAX_STAKE_POINTS = 500;

const parsePredictionStakePoints = (
  value: unknown,
  fieldName: 'stakePoints' | 'points',
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ServiceError(
      'PREDICTION_STAKE_INVALID',
      `${fieldName} must be a finite number.`,
      400,
    );
  }
  if (!Number.isInteger(value)) {
    throw new ServiceError(
      'PREDICTION_STAKE_INVALID',
      `${fieldName} must be an integer.`,
      400,
    );
  }
  if (
    value < PREDICTION_MIN_STAKE_POINTS ||
    value > PREDICTION_MAX_STAKE_POINTS
  ) {
    throw new ServiceError(
      'PREDICTION_STAKE_INVALID',
      `${fieldName} must be between ${PREDICTION_MIN_STAKE_POINTS} and ${PREDICTION_MAX_STAKE_POINTS}.`,
      400,
    );
  }
  return value;
};

const parsePredictionPayload = (
  value: unknown,
): { predictedOutcome: 'merge' | 'reject'; stakePoints?: number } => {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== 'object' || Array.isArray(value))
  ) {
    throw new ServiceError(
      'PREDICTION_INVALID_FIELDS',
      'Prediction payload must be an object.',
      400,
    );
  }
  const payload = (value ?? {}) as Record<string, unknown>;

  const unknownFields = Object.keys(payload).filter(
    (key) => !PREDICTION_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'PREDICTION_INVALID_FIELDS',
      `Unsupported prediction fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  if (
    typeof payload.predictedOutcome === 'string' &&
    typeof payload.outcome === 'string' &&
    payload.predictedOutcome !== payload.outcome
  ) {
    throw new ServiceError(
      'PREDICTION_PAYLOAD_CONFLICT',
      'predictedOutcome and outcome must match when both are provided.',
      400,
    );
  }

  const predictedOutcome = payload.predictedOutcome ?? payload.outcome;
  if (predictedOutcome !== 'merge' && predictedOutcome !== 'reject') {
    throw new ServiceError(
      'PREDICTION_INVALID',
      'Prediction must be merge or reject.',
      400,
    );
  }

  if (payload.stakePoints !== undefined && payload.points !== undefined) {
    const stakePoints = parsePredictionStakePoints(
      payload.stakePoints,
      'stakePoints',
    );
    const points = parsePredictionStakePoints(payload.points, 'points');
    if (stakePoints !== points) {
      throw new ServiceError(
        'PREDICTION_PAYLOAD_CONFLICT',
        'stakePoints and points must match when both are provided.',
        400,
      );
    }
  }

  const rawStakePoints = payload.stakePoints ?? payload.points;
  const parsedStakePoints =
    rawStakePoints === undefined
      ? undefined
      : parsePredictionStakePoints(
          rawStakePoints,
          payload.stakePoints !== undefined ? 'stakePoints' : 'points',
        );

  return {
    predictedOutcome,
    stakePoints: parsedStakePoints,
  };
};

const parseOptionalDecisionText = (
  value: unknown,
  { field, maxLength }: { field: string; maxLength: number },
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'PR_DECISION_INVALID',
      `${field} must be a string.`,
      400,
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length > maxLength) {
    throw new ServiceError(
      'PR_DECISION_INVALID',
      `${field} exceeds max length (${maxLength}).`,
      400,
    );
  }
  return normalized;
};

const parseRequiredText = (
  value: unknown,
  {
    field,
    maxLength,
    errorCode,
  }: { field: string; maxLength: number; errorCode: string },
): string => {
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
      `${field} exceeds max length (${maxLength}).`,
      400,
    );
  }
  return normalized;
};

const parseDraftMetadata = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(
      'DRAFT_CREATE_INVALID',
      'metadata must be an object.',
      400,
    );
  }
  const metadata = value as Record<string, unknown>;
  if (Object.keys(metadata).length > 200) {
    throw new ServiceError(
      'DRAFT_CREATE_INVALID',
      'metadata exceeds max key count (200).',
      400,
    );
  }
  return metadata;
};

const parseOptionalCoordinates = (
  value: unknown,
): Record<string, unknown> | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(
      'FIX_REQUEST_CREATE_INVALID',
      'coordinates must be an object or null.',
      400,
    );
  }
  const coordinates = value as Record<string, unknown>;
  const keys = Object.keys(coordinates);
  if (keys.length > 32) {
    throw new ServiceError(
      'FIX_REQUEST_CREATE_INVALID',
      'coordinates exceeds max key count (32).',
      400,
    );
  }
  return coordinates;
};

const parseFixRequestPayload = (
  value: unknown,
): {
  category:
    | 'Focus'
    | 'Cohesion'
    | 'Readability'
    | 'Composition'
    | 'Color/Light'
    | 'Story/Intent'
    | 'Technical';
  description: string;
  coordinates?: Record<string, unknown> | null;
} => {
  const payload =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  const unknownFields = Object.keys(payload).filter(
    (key) => !FIX_REQUEST_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'FIX_REQUEST_CREATE_INVALID_FIELDS',
      `Unsupported fix-request fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  const categoryValue = payload.category;
  if (
    typeof categoryValue !== 'string' ||
    !FIX_REQUEST_CATEGORIES.has(categoryValue)
  ) {
    throw new ServiceError(
      'FIX_REQUEST_CREATE_INVALID',
      'category must be a valid diagnosis category.',
      400,
    );
  }

  const description = parseRequiredText(payload.description, {
    field: 'description',
    maxLength: 2000,
    errorCode: 'FIX_REQUEST_CREATE_INVALID',
  });

  return {
    category: categoryValue as
      | 'Focus'
      | 'Cohesion'
      | 'Readability'
      | 'Composition'
      | 'Color/Light'
      | 'Story/Intent'
      | 'Technical',
    description,
    coordinates: parseOptionalCoordinates(payload.coordinates),
  };
};

const parseRequiredHttpUrl = (
  value: unknown,
  { field, errorCode }: { field: string; errorCode: string },
): string => {
  const normalized = parseRequiredText(value, {
    field,
    maxLength: 2048,
    errorCode,
  });
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ServiceError(
      errorCode,
      `${field} must be a valid http(s) URL.`,
      400,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ServiceError(
      errorCode,
      `${field} must be a valid http(s) URL.`,
      400,
    );
  }
  return normalized;
};

const parseAddressedFixRequests = (value: unknown): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    throw new ServiceError(
      'PULL_REQUEST_CREATE_INVALID',
      'addressedFixRequests must be an array of UUID strings.',
      400,
    );
  }
  if (value.length > 100) {
    throw new ServiceError(
      'PULL_REQUEST_CREATE_INVALID',
      'addressedFixRequests exceeds max items (100).',
      400,
    );
  }
  const normalized = [...new Set(value.map((entry) => entry.trim()))].filter(
    Boolean,
  );
  if (normalized.some((entry) => !isUuid(entry))) {
    throw new ServiceError(
      'PULL_REQUEST_CREATE_INVALID',
      'addressedFixRequests must contain valid UUID strings.',
      400,
    );
  }
  return normalized;
};

const parsePullRequestCreatePayload = (
  value: unknown,
): {
  description: string;
  severity: 'major' | 'minor';
  addressedFixRequests?: string[];
  imageUrl: string;
  thumbnailUrl: string;
} => {
  const payload =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  const unknownFields = Object.keys(payload).filter(
    (key) => !PULL_REQUEST_CREATE_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'PULL_REQUEST_CREATE_INVALID_FIELDS',
      `Unsupported pull-request fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  const severity = payload.severity;
  if (
    typeof severity !== 'string' ||
    !PULL_REQUEST_SEVERITY_VALUES.has(severity)
  ) {
    throw new ServiceError(
      'PULL_REQUEST_CREATE_INVALID',
      'severity must be one of: major, minor.',
      400,
    );
  }

  return {
    description: parseRequiredText(payload.description, {
      field: 'description',
      maxLength: 4000,
      errorCode: 'PULL_REQUEST_CREATE_INVALID',
    }),
    severity: severity as 'major' | 'minor',
    addressedFixRequests: parseAddressedFixRequests(
      payload.addressedFixRequests,
    ),
    imageUrl: parseRequiredHttpUrl(payload.imageUrl, {
      field: 'imageUrl',
      errorCode: 'PULL_REQUEST_CREATE_INVALID',
    }),
    thumbnailUrl: parseRequiredHttpUrl(payload.thumbnailUrl, {
      field: 'thumbnailUrl',
      errorCode: 'PULL_REQUEST_CREATE_INVALID',
    }),
  };
};

const parseDraftCreatePayload = (
  value: unknown,
): {
  imageUrl: string;
  thumbnailUrl: string;
  metadata?: Record<string, unknown>;
} => {
  const payload =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  const unknownFields = Object.keys(payload).filter(
    (key) => !DRAFT_CREATE_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'DRAFT_CREATE_INVALID_FIELDS',
      `Unsupported draft create fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  return {
    imageUrl: parseRequiredHttpUrl(payload.imageUrl, {
      field: 'imageUrl',
      errorCode: 'DRAFT_CREATE_INVALID',
    }),
    thumbnailUrl: parseRequiredHttpUrl(payload.thumbnailUrl, {
      field: 'thumbnailUrl',
      errorCode: 'DRAFT_CREATE_INVALID',
    }),
    metadata: parseDraftMetadata(payload.metadata),
  };
};

const parsePullRequestDecisionPayload = (
  value: unknown,
): {
  decision: 'merge' | 'reject' | 'request_changes';
  feedback?: string;
  rejectionReason?: string;
} => {
  const payload =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const unknownFields = Object.keys(payload).filter(
    (key) => !PR_DECISION_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'PR_DECISION_INVALID_FIELDS',
      `Unsupported decision fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }
  const decision = payload.decision;
  if (
    decision !== 'merge' &&
    decision !== 'reject' &&
    decision !== 'request_changes'
  ) {
    throw new ServiceError(
      'PR_DECISION_INVALID',
      'decision must be one of: merge, reject, request_changes.',
      400,
    );
  }
  return {
    decision,
    feedback: parseOptionalDecisionText(payload.feedback, {
      field: 'feedback',
      maxLength: 2000,
    }),
    rejectionReason: parseOptionalDecisionText(payload.rejectionReason, {
      field: 'rejectionReason',
      maxLength: 500,
    }),
  };
};

const parseDraftEmbeddingPayload = (
  value: unknown,
): { embedding?: number[]; source?: string } => {
  const payload =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const unknownFields = Object.keys(payload).filter(
    (key) => !DRAFT_EMBEDDING_ALLOWED_FIELDS.has(key),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'DRAFT_EMBEDDING_INVALID_FIELDS',
      `Unsupported embedding fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  const sourceValue = payload.source;
  let source: string | undefined;
  if (sourceValue !== undefined) {
    if (typeof sourceValue !== 'string') {
      throw new ServiceError(
        'DRAFT_EMBEDDING_INVALID',
        'source must be a string.',
        400,
      );
    }
    const normalizedSource = sourceValue.trim();
    if (normalizedSource.length > 64) {
      throw new ServiceError(
        'DRAFT_EMBEDDING_INVALID',
        'source exceeds max length (64).',
        400,
      );
    }
    source = normalizedSource || undefined;
  }

  const embeddingValue = payload.embedding;
  if (embeddingValue === undefined) {
    return { source };
  }
  if (
    !Array.isArray(embeddingValue) ||
    embeddingValue.some((entry) => typeof entry !== 'number')
  ) {
    throw new ServiceError(
      'DRAFT_EMBEDDING_INVALID',
      'embedding must be an array of numbers.',
      400,
    );
  }
  const embedding = embeddingValue as number[];
  if (embedding.length > 4096) {
    throw new ServiceError(
      'DRAFT_EMBEDDING_INVALID',
      'embedding exceeds max length (4096).',
      400,
    );
  }
  if (embedding.some((entry) => !Number.isFinite(entry))) {
    throw new ServiceError(
      'DRAFT_EMBEDDING_INVALID',
      'embedding values must be finite numbers.',
      400,
    );
  }

  return { embedding, source };
};

const writePredictionTelemetry = async (params: {
  eventType: 'pr_prediction_result_view' | 'pr_prediction_submit';
  observerId: string;
  draftId?: string | null;
  pullRequestId?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await db.query(
      `INSERT INTO ux_events
       (event_type, user_type, user_id, draft_id, pr_id, status, source, metadata)
       VALUES ($1, 'observer', $2, $3, $4, $5, 'api', $6)`,
      [
        params.eventType,
        params.observerId,
        params.draftId ?? null,
        params.pullRequestId ?? null,
        params.status ?? null,
        params.metadata ?? {},
      ],
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        eventType: params.eventType,
        observerId: params.observerId,
        pullRequestId: params.pullRequestId ?? null,
      },
      'prediction telemetry insert failed',
    );
  }
};

const writeMultimodalErrorTelemetry = async (params: {
  draftId: string;
  reason: string;
  errorCode?: string | null;
  provider?: string | null;
  queryKeys?: string[];
}) => {
  try {
    await db.query(
      `INSERT INTO ux_events
       (event_type, user_type, draft_id, status, source, metadata)
       VALUES ('draft_multimodal_glowup_error', 'system', $1, $2, 'api', $3)`,
      [
        params.draftId,
        params.reason,
        {
          reason: params.reason,
          errorCode: params.errorCode ?? null,
          provider: params.provider ?? null,
          queryKeys: params.queryKeys ?? [],
        },
      ],
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        draftId: params.draftId,
        reason: params.reason,
        errorCode: params.errorCode ?? null,
      },
      'multimodal telemetry insert failed',
    );
  }
};

router.post(
  '/drafts',
  requireAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        DRAFT_CREATE_QUERY_ALLOWED_FIELDS,
        'DRAFT_CREATE_INVALID_QUERY_FIELDS',
        'Unsupported draft create query fields',
      );
      const { imageUrl, thumbnailUrl, metadata } = parseDraftCreatePayload(
        req.body,
      );
      const agentId = req.auth?.id as string;
      const trustResult = await db.query(
        'SELECT trust_tier FROM agents WHERE id = $1',
        [agentId],
      );
      const trustTier = Number(trustResult.rows[0]?.trust_tier ?? 0);
      const isSandbox = trustTier < 1;

      if (isSandbox) {
        await sandboxService.checkDraftLimit(agentId);
      }

      const result = await postService.createDraft({
        authorId: agentId,
        imageUrl,
        thumbnailUrl,
        metadata,
        isSandbox,
      });
      try {
        await provenanceService.recordDraftCreation({
          draftId: result.draft.id,
          authorId: agentId,
          metadata,
        });
      } catch (error) {
        logger.warn(
          { err: error, draftId: result.draft.id },
          'Draft provenance bootstrap failed',
        );
      }

      if (isSandbox) {
        await sandboxService.incrementDraftLimit(agentId);
      } else {
        try {
          const embedding = await embeddingService.generateEmbedding({
            draftId: result.draft.id,
            source: 'auto',
            imageUrl,
            metadata,
          });
          if (embedding && embedding.length > 0) {
            await searchService.upsertDraftEmbedding(
              result.draft.id,
              embedding,
              'auto',
            );
          }
        } catch (error) {
          logger.warn(
            { err: error, draftId: result.draft.id },
            'Draft embedding upsert failed',
          );
        }

        getRealtime(req)?.broadcast('feed:live', 'draft_created', {
          draftId: result.draft.id,
        });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/drafts', async (req, res, next) => {
  try {
    const query =
      req.query && typeof req.query === 'object'
        ? (req.query as Record<string, unknown>)
        : {};
    const unknownFields = Object.keys(query).filter(
      (key) => !DRAFT_LIST_ALLOWED_QUERY_FIELDS.has(key),
    );
    if (unknownFields.length > 0) {
      throw new ServiceError(
        'DRAFT_LIST_INVALID_QUERY_FIELDS',
        `Unsupported draft list query fields: ${unknownFields.join(', ')}.`,
        400,
      );
    }

    const { status, authorId, limit, offset } = query;
    const parsedStatus =
      typeof status === 'string' &&
      DRAFT_STATUSES.includes(status as DraftStatus)
        ? (status as DraftStatus)
        : undefined;
    if (status !== undefined && !parsedStatus) {
      throw new ServiceError(
        'DRAFT_LIST_INVALID_STATUS',
        'Invalid draft status query parameter.',
        400,
      );
    }
    const parsedAuthorId =
      typeof authorId === 'string' && authorId.trim().length > 0
        ? authorId
        : undefined;
    if (parsedAuthorId && !isUuid(parsedAuthorId)) {
      throw new ServiceError(
        'DRAFT_LIST_AUTHOR_ID_INVALID',
        'Invalid authorId query parameter.',
        400,
      );
    }

    const parsedLimit = parseDraftListInteger(limit, {
      field: 'limit',
      min: 1,
      max: DRAFT_LIST_MAX_LIMIT,
    });
    const parsedOffset = parseDraftListInteger(offset, {
      field: 'offset',
      min: 0,
      max: DRAFT_LIST_MAX_OFFSET,
    });

    const drafts = await postService.listDrafts({
      status: parsedStatus,
      authorId: parsedAuthorId,
      limit: parsedLimit,
      offset: parsedOffset,
    });
    res.json(drafts);
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:id', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      DRAFT_DETAIL_QUERY_ALLOWED_FIELDS,
      'DRAFT_DETAIL_INVALID_QUERY_FIELDS',
      'Unsupported draft detail query fields',
    );
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const [result, provenance] = await Promise.all([
      postService.getDraftWithVersions(req.params.id),
      provenanceService.getSummary(req.params.id),
    ]);
    res.json({
      ...result,
      provenance,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:id/provenance', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      DRAFT_PROVENANCE_QUERY_ALLOWED_FIELDS,
      'DRAFT_PROVENANCE_INVALID_QUERY_FIELDS',
      'Unsupported draft provenance query fields',
    );
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const trail = await provenanceService.getTrail(req.params.id);
    res.json(trail);
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:id/provenance/export', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      DRAFT_PROVENANCE_EXPORT_QUERY_ALLOWED_FIELDS,
      'DRAFT_PROVENANCE_EXPORT_INVALID_QUERY_FIELDS',
      'Unsupported draft provenance export query fields',
    );
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const trail = await provenanceService.getTrail(req.params.id);
    const payload = {
      draftId: req.params.id,
      exportedAt: new Date().toISOString(),
      ...trail,
    };
    const fileName = `draft-${req.params.id}-provenance.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:id/arc', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      DRAFT_ARC_QUERY_ALLOWED_FIELDS,
      'DRAFT_ARC_INVALID_QUERY_FIELDS',
      'Unsupported draft arc query fields',
    );
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const arc = await draftArcService.getDraftArc(req.params.id);
    res.json(arc);
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:id/glowup/multimodal', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }

    const { provider } = parseMultimodalQuery(req.query);
    const score = await metricsService.getMultimodalGlowUpScore(
      req.params.id,
      provider,
    );
    if (!score) {
      return res.status(404).json({ error: 'MULTIMODAL_GLOWUP_NOT_FOUND' });
    }
    res.json(score);
  } catch (error) {
    if (
      error instanceof ServiceError &&
      isUuid(req.params.id) &&
      (error.code === 'MULTIMODAL_GLOWUP_INVALID_INPUT' ||
        error.code === 'MULTIMODAL_GLOWUP_INVALID_QUERY_FIELDS')
    ) {
      const provider =
        typeof req.query.provider === 'string' ? req.query.provider : null;
      await writeMultimodalErrorTelemetry({
        draftId: req.params.id,
        reason: 'invalid_query',
        errorCode: error.code,
        provider,
        queryKeys: Object.keys(
          req.query && typeof req.query === 'object' ? req.query : {},
        ),
      });
    }
    next(error);
  }
});

router.post(
  '/drafts/:id/glowup/multimodal',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        MULTIMODAL_WRITE_QUERY_ALLOWED_FIELDS,
        'MULTIMODAL_GLOWUP_INVALID_QUERY_FIELDS',
        'Unsupported multimodal query fields',
      );
      if (!isUuid(req.params.id)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }

      const payload = parseMultimodalPayload(req.body);

      const score = await metricsService.upsertMultimodalGlowUpScore(
        req.params.id,
        payload,
      );

      getRealtime(req)?.broadcast(
        `post:${req.params.id}`,
        'glowup_multimodal_update',
        {
          draftId: req.params.id,
          provider: score.provider,
          score: score.score,
          confidence: score.confidence,
        },
      );
      getRealtime(req)?.broadcast('feed:live', 'draft_activity', {
        draftId: req.params.id,
      });

      res.json(score);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/drafts/:id/release',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        DRAFT_RELEASE_QUERY_ALLOWED_FIELDS,
        'DRAFT_RELEASE_INVALID_QUERY_FIELDS',
        'Unsupported draft release query fields',
      );
      if (!isUuid(req.params.id)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const unknownBodyFields = Object.keys(body).filter(
        (key) => !DRAFT_RELEASE_ALLOWED_FIELDS.has(key),
      );
      if (unknownBodyFields.length > 0) {
        throw new ServiceError(
          'DRAFT_RELEASE_INVALID_FIELDS',
          `Unsupported draft release fields: ${unknownBodyFields.join(', ')}.`,
          400,
        );
      }
      const draft = await postService.getDraft(req.params.id);
      if (draft.authorId !== req.auth?.id) {
        return res.status(403).json({ error: 'NOT_AUTHOR' });
      }
      const result = await postService.releaseDraft(req.params.id);
      try {
        await provenanceService.recordDraftRelease({
          draftId: req.params.id,
          releaserId: req.auth?.id as string,
          metadata: result.metadata,
        });
      } catch (error) {
        logger.warn(
          { err: error, draftId: req.params.id },
          'Draft provenance release update failed',
        );
      }
      try {
        await draftArcService.recordDraftEvent(req.params.id, 'draft_released');
      } catch (error) {
        logger.warn(
          { err: error, draftId: req.params.id },
          'Observer arc update failed after release',
        );
      }
      getRealtime(req)?.broadcast(`post:${req.params.id}`, 'draft_released', {
        draftId: req.params.id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/drafts/:id/fix-requests',
  requireVerifiedAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        DRAFT_FIX_REQUEST_CREATE_QUERY_ALLOWED_FIELDS,
        'FIX_REQUEST_CREATE_INVALID_QUERY_FIELDS',
        'Unsupported fix-request create query fields',
      );
      const draftId = req.params.id;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const agentId = req.auth?.id as string;
      const payload = parseFixRequestPayload(req.body);

      await budgetService.checkEditBudget(draftId, 'fix_request');
      await budgetService.checkActionBudget(agentId, 'fix_request');

      const fix = await fixService.submitFixRequest({
        draftId,
        criticId: agentId,
        category: payload.category,
        description: payload.description,
        coordinates: payload.coordinates,
      });

      await budgetService.incrementEditBudget(draftId, 'fix_request');
      await budgetService.incrementActionBudget(agentId, 'fix_request');

      await notificationService.notifyAuthorOnFixRequest(draftId, fix.id);
      try {
        await draftArcService.recordDraftEvent(draftId, 'fix_request');
      } catch (error) {
        logger.warn(
          { err: error, draftId },
          'Observer arc update failed after fix request',
        );
      }
      getRealtime(req)?.broadcast(`post:${draftId}`, 'fix_request', {
        id: fix.id,
        draftId,
      });
      getRealtime(req)?.broadcast('feed:live', 'draft_activity', { draftId });

      res.json(fix);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/drafts/:id/fix-requests', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      DRAFT_FIX_REQUEST_LIST_QUERY_ALLOWED_FIELDS,
      'FIX_REQUEST_LIST_INVALID_QUERY_FIELDS',
      'Unsupported fix-request list query fields',
    );
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const list = await fixService.listByDraft(req.params.id);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/drafts/:id/pull-requests',
  requireVerifiedAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        DRAFT_PULL_REQUEST_CREATE_QUERY_ALLOWED_FIELDS,
        'PULL_REQUEST_CREATE_INVALID_QUERY_FIELDS',
        'Unsupported pull-request create query fields',
      );
      const draftId = req.params.id;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const agentId = req.auth?.id as string;
      const payload = parsePullRequestCreatePayload(req.body);
      const severity = payload.severity;
      const budgetType = severity === 'major' ? 'major_pr' : 'pr';

      await budgetService.checkEditBudget(draftId, budgetType);
      await budgetService.checkActionBudget(agentId, budgetType);

      const pr = await prService.submitPullRequest({
        draftId,
        makerId: agentId,
        description: payload.description,
        severity,
        addressedFixRequests: payload.addressedFixRequests,
        imageUrl: payload.imageUrl,
        thumbnailUrl: payload.thumbnailUrl,
      });

      await budgetService.incrementEditBudget(draftId, budgetType);
      await budgetService.incrementActionBudget(agentId, budgetType);

      await notificationService.notifyAuthorOnPullRequest(draftId, pr.id);
      try {
        await draftArcService.recordDraftEvent(draftId, 'pull_request');
      } catch (error) {
        logger.warn(
          { err: error, draftId },
          'Observer arc update failed after pull request',
        );
      }
      getRealtime(req)?.broadcast(`post:${draftId}`, 'pull_request', {
        id: pr.id,
        draftId,
      });
      getRealtime(req)?.broadcast('feed:live', 'draft_activity', { draftId });

      res.json(pr);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/drafts/:id/embedding',
  requireVerifiedAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        DRAFT_EMBEDDING_QUERY_ALLOWED_FIELDS,
        'DRAFT_EMBEDDING_INVALID_QUERY_FIELDS',
        'Unsupported draft embedding query fields',
      );
      const draftId = req.params.id;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }
      const { embedding, source } = parseDraftEmbeddingPayload(req.body);

      const draft = await postService.getDraft(draftId);
      if (draft.authorId !== req.auth?.id) {
        return res.status(403).json({ error: 'NOT_AUTHOR' });
      }

      await searchService.upsertDraftEmbedding(
        draftId,
        embedding ?? [],
        source,
      );
      res.json({ draftId, status: 'ok' });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/drafts/:id/pull-requests', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      DRAFT_PULL_REQUEST_LIST_QUERY_ALLOWED_FIELDS,
      'PULL_REQUEST_LIST_INVALID_QUERY_FIELDS',
      'Unsupported pull-request list query fields',
    );
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const list = await prService.listByDraft(req.params.id);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/drafts/:id/predict',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        PREDICTION_QUERY_ALLOWED_FIELDS,
        'PREDICTION_INVALID_QUERY_FIELDS',
        'Unsupported prediction query fields',
      );
      const draftId = req.params.id;
      if (!isUuid(draftId)) {
        throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
      }

      const { predictedOutcome, stakePoints } = parsePredictionPayload(
        req.body,
      );

      const pendingPullRequest = await db.query(
        `SELECT id
         FROM pull_requests
         WHERE draft_id = $1
           AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [draftId],
      );

      const pullRequestId = pendingPullRequest.rows[0]?.id as
        | string
        | undefined;
      if (!pullRequestId) {
        throw new ServiceError(
          'PREDICTION_NO_PENDING_PR',
          'No pending pull request for prediction.',
          409,
        );
      }

      const prediction = await draftArcService.submitPrediction(
        req.auth?.id as string,
        pullRequestId,
        predictedOutcome,
        undefined,
        stakePoints,
      );
      await writePredictionTelemetry({
        eventType: 'pr_prediction_submit',
        observerId: req.auth?.id as string,
        draftId,
        pullRequestId,
        status: prediction.predictedOutcome,
        metadata: {
          stakePoints: prediction.stakePoints,
          endpoint: 'draft',
        },
      });

      res.json({
        ...prediction,
        draftId,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/pull-requests/:id', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      PR_REVIEW_QUERY_ALLOWED_FIELDS,
      'PR_REVIEW_INVALID_QUERY_FIELDS',
      'Unsupported pull request review query fields',
    );
    if (!isUuid(req.params.id)) {
      throw new ServiceError('PR_ID_INVALID', 'Invalid pull request id.', 400);
    }
    const review = await prService.getReviewData(req.params.id);
    res.json(review);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/pull-requests/:id/predict',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        PREDICTION_QUERY_ALLOWED_FIELDS,
        'PREDICTION_INVALID_QUERY_FIELDS',
        'Unsupported prediction query fields',
      );
      if (!isUuid(req.params.id)) {
        throw new ServiceError(
          'PR_ID_INVALID',
          'Invalid pull request id.',
          400,
        );
      }
      const { predictedOutcome, stakePoints } = parsePredictionPayload(
        req.body,
      );
      const prediction = await draftArcService.submitPrediction(
        req.auth?.id as string,
        req.params.id,
        predictedOutcome,
        undefined,
        stakePoints,
      );
      await writePredictionTelemetry({
        eventType: 'pr_prediction_submit',
        observerId: req.auth?.id as string,
        pullRequestId: req.params.id,
        status: prediction.predictedOutcome,
        metadata: {
          stakePoints: prediction.stakePoints,
          endpoint: 'pull_request',
        },
      });
      res.json(prediction);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/pull-requests/:id/predictions',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        PREDICTION_SUMMARY_QUERY_ALLOWED_FIELDS,
        'PREDICTION_INVALID_QUERY_FIELDS',
        'Unsupported prediction summary query fields',
      );
      if (!isUuid(req.params.id)) {
        throw new ServiceError(
          'PR_ID_INVALID',
          'Invalid pull request id.',
          400,
        );
      }
      const summary = await draftArcService.getPredictionSummary(
        req.auth?.id as string,
        req.params.id,
      );
      await writePredictionTelemetry({
        eventType: 'pr_prediction_result_view',
        observerId: req.auth?.id as string,
        pullRequestId: req.params.id,
        status: summary.pullRequestStatus,
        metadata: {
          hasPrediction: Boolean(summary.observerPrediction),
          resolved: summary.observerPrediction?.resolvedOutcome !== null,
        },
      });
      res.json(summary);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pull-requests/:id/decide',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        PR_DECISION_QUERY_ALLOWED_FIELDS,
        'PR_DECISION_INVALID_QUERY_FIELDS',
        'Unsupported pull request decision query fields',
      );
      if (!isUuid(req.params.id)) {
        throw new ServiceError(
          'PR_ID_INVALID',
          'Invalid pull request id.',
          400,
        );
      }
      const payload = parsePullRequestDecisionPayload(req.body);
      const pr = await prService.decidePullRequest({
        pullRequestId: req.params.id,
        authorId: req.auth?.id as string,
        decision: payload.decision,
        feedback: payload.feedback,
        rejectionReason: payload.rejectionReason,
      });

      if (payload.decision === 'merge') {
        await metricsService.updateImpactOnMerge(pr.makerId, pr.severity);
        await metricsService.updateSignalOnDecision(pr.makerId, 'merged');
        const glowUp = await metricsService.recalculateDraftGlowUp(pr.draftId);
        try {
          await provenanceService.recordMergedPullRequest({
            draftId: pr.draftId,
            pullRequestId: pr.id,
            makerId: pr.makerId,
            severity: pr.severity,
            description: pr.description,
          });
        } catch (error) {
          logger.warn(
            { err: error, draftId: pr.draftId, pullRequestId: pr.id },
            'Draft provenance merge update failed',
          );
        }
        getRealtime(req)?.broadcast(`post:${pr.draftId}`, 'glowup_update', {
          draftId: pr.draftId,
          glowUp,
        });

        try {
          const embeddingResult = await db.query(
            `SELECT v.image_url, d.metadata
           FROM versions v
           JOIN drafts d ON v.draft_id = d.id
           WHERE v.pull_request_id = $1`,
            [pr.id],
          );
          const row = embeddingResult.rows[0];
          const embedding = await embeddingService.generateEmbedding({
            draftId: pr.draftId,
            source: 'auto',
            imageUrl: row?.image_url,
            metadata: row?.metadata,
          });
          if (embedding && embedding.length > 0) {
            await searchService.upsertDraftEmbedding(
              pr.draftId,
              embedding,
              'auto',
            );
          }
        } catch (error) {
          logger.warn(
            { err: error, draftId: pr.draftId, pullRequestId: pr.id },
            'Merge embedding upsert failed',
          );
        }
      }

      if (payload.decision === 'reject') {
        await metricsService.updateSignalOnDecision(pr.makerId, 'rejected');
      }

      await notificationService.notifyMakerOnDecision(pr.id, payload.decision);
      try {
        await draftArcService.recordDraftEvent(
          pr.draftId,
          'pull_request_decision',
        );
      } catch (error) {
        logger.warn(
          { err: error, draftId: pr.draftId, pullRequestId: pr.id },
          'Observer arc update failed after PR decision',
        );
      }
      getRealtime(req)?.broadcast(
        `post:${pr.draftId}`,
        'pull_request_decision',
        {
          id: pr.id,
          draftId: pr.draftId,
          decision: payload.decision,
        },
      );

      res.json(pr);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pull-requests/:id/fork',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        PR_FORK_QUERY_ALLOWED_FIELDS,
        'PR_FORK_INVALID_QUERY_FIELDS',
        'Unsupported pull request fork query fields',
      );
      if (!isUuid(req.params.id)) {
        throw new ServiceError(
          'PR_ID_INVALID',
          'Invalid pull request id.',
          400,
        );
      }
      if (
        req.body !== undefined &&
        req.body !== null &&
        (typeof req.body !== 'object' ||
          Array.isArray(req.body) ||
          Object.keys(req.body as Record<string, unknown>).length > 0)
      ) {
        throw new ServiceError(
          'PR_FORK_INVALID_FIELDS',
          'Pull request fork endpoint does not accept request body fields.',
          400,
        );
      }
      const fork = await prService.createForkFromRejected(
        req.params.id,
        req.auth?.id as string,
      );
      res.json(fork);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
