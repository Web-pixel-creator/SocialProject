import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman, requireVerifiedAgent } from '../middleware/auth';
import { observerActionRateLimiter } from '../middleware/security';
import { agentGatewayService } from '../services/agentGateway/agentGatewayService';
import { ServiceError } from '../services/common/errors';
import { LiveSessionServiceImpl } from '../services/liveSession/liveSessionService';
import type {
  AddLiveMessageInput,
  CompleteLiveSessionInput,
  CreateLiveSessionInput,
  LiveSessionPresenceStatus,
  LiveStudioSessionStatus,
  UpsertLivePresenceInput,
} from '../services/liveSession/types';
import { DraftArcServiceImpl } from '../services/observer/draftArcService';
import { OpenAIRealtimeSessionServiceImpl } from '../services/openaiRealtime/openaiRealtimeSessionService';
import type {
  RealtimeOutputModality,
  RealtimeVoice,
} from '../services/openaiRealtime/types';
import type { RealtimeService } from '../services/realtime/types';

const router = Router();
const liveSessionService = new LiveSessionServiceImpl(db);
const openAIRealtimeSessionService = new OpenAIRealtimeSessionServiceImpl();
const draftArcService = new DraftArcServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIVE_STATUSES: LiveStudioSessionStatus[] = [
  'forming',
  'live',
  'completed',
  'cancelled',
];
const LIVE_SESSION_QUERY_FIELDS = ['status', 'limit', 'offset'] as const;
const LIVE_SESSION_DETAIL_QUERY_FIELDS = [] as const;
const LIVE_SESSION_CREATE_QUERY_FIELDS = [] as const;
const LIVE_SESSION_CREATE_BODY_FIELDS = [
  'draftId',
  'title',
  'objective',
  'isPublic',
] as const;
const LIVE_SESSION_START_QUERY_FIELDS = [] as const;
const LIVE_SESSION_START_BODY_FIELDS = [] as const;
const LIVE_SESSION_COMPLETE_QUERY_FIELDS = [] as const;
const LIVE_SESSION_COMPLETE_BODY_FIELDS = [
  'recapSummary',
  'recapClipUrl',
] as const;
const LIVE_SESSION_PRESENCE_QUERY_FIELDS = [] as const;
const LIVE_SESSION_PRESENCE_BODY_FIELDS = ['status'] as const;
const LIVE_SESSION_OBSERVER_MESSAGE_BODY_FIELDS = ['content'] as const;
const LIVE_SESSION_AGENT_MESSAGE_BODY_FIELDS = [
  'content',
  'authorLabel',
] as const;
const LIVE_SESSION_MESSAGES_QUERY_FIELDS = [] as const;
const LIVE_SESSION_REALTIME_QUERY_FIELDS = [] as const;
const LIVE_SESSION_REALTIME_BODY_FIELDS = [
  'outputModalities',
  'voice',
  'pushToTalk',
  'topicHint',
  'metadata',
] as const;
const LIVE_SESSION_REALTIME_TOOL_QUERY_FIELDS = [] as const;
const LIVE_SESSION_REALTIME_TOOL_BODY_FIELDS = [
  'callId',
  'name',
  'toolName',
  'arguments',
] as const;
const LIVE_SESSION_TITLE_MAX_LENGTH = 160;
const LIVE_SESSION_OBJECTIVE_MAX_LENGTH = 1000;
const LIVE_SESSION_RECAP_SUMMARY_MAX_LENGTH = 2000;
const LIVE_SESSION_AUTHOR_LABEL_MAX_LENGTH = 80;
const LIVE_SESSION_MESSAGE_MAX_LENGTH = 500;
const LIVE_SESSION_REALTIME_TOPIC_HINT_MAX_LENGTH = 240;
const LIVE_SESSION_REALTIME_METADATA_MAX_KEYS = 10;
const LIVE_SESSION_REALTIME_METADATA_KEY_MAX_LENGTH = 48;
const LIVE_SESSION_REALTIME_METADATA_VALUE_MAX_LENGTH = 160;
const LIVE_SESSION_REALTIME_TOOL_CALL_ID_MAX_LENGTH = 120;
const LIVE_SESSION_REALTIME_TOOL_ARGUMENTS_MAX_LENGTH = 10_000;
const PRESENCE_STATUSES: LiveSessionPresenceStatus[] = [
  'watching',
  'active',
  'left',
];
const LIVE_SESSIONS_MAX_LIMIT = 100;
const LIVE_SESSIONS_MAX_OFFSET = 10_000;
const REALTIME_OUTPUT_MODALITIES = ['text', 'audio'] as const;
const REALTIME_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const;
const LIVE_SESSION_REALTIME_TOOLS = [
  'place_prediction',
  'follow_studio',
] as const;
const PREDICTION_MIN_STAKE_POINTS = 5;
const PREDICTION_MAX_STAKE_POINTS = 500;
const isUuid = (value: string) => UUID_PATTERN.test(value);

type LiveSessionRealtimeTool = (typeof LIVE_SESSION_REALTIME_TOOLS)[number];

const assertLiveSessionIdParam = (value: string) => {
  if (!isUuid(value)) {
    throw new ServiceError(
      'LIVE_SESSION_ID_INVALID',
      'Invalid live session id.',
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
  }: { field: string; maxLength: number; errorCode: string },
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
  }: { field: string; maxLength: number; errorCode: string },
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

const parseOptionalUuid = (value: unknown, field: string) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError('DRAFT_ID_INVALID', `${field} must be a UUID.`, 400);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (!isUuid(normalized)) {
    throw new ServiceError('DRAFT_ID_INVALID', `${field} must be a UUID.`, 400);
  }
  return normalized;
};

const parseOptionalBoolean = (
  value: unknown,
  { field, errorCode }: { field: string; errorCode: string },
) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new ServiceError(errorCode, `${field} must be a boolean.`, 400);
  }
  return value;
};

const parseOptionalHttpsUrl = (
  value: unknown,
  { field, errorCode }: { field: string; errorCode: string },
) => {
  const normalized = parseOptionalBoundedText(value, {
    field,
    maxLength: 2000,
    errorCode,
  });
  if (!normalized) {
    return undefined;
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch (_error) {
    throw new ServiceError(errorCode, `${field} must be a valid URL.`, 400);
  }
  if (!(parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:')) {
    throw new ServiceError(errorCode, `${field} must use http or https.`, 400);
  }
  return normalized;
};

const parseCreateLiveSessionInput = (
  body: Record<string, unknown>,
): CreateLiveSessionInput => ({
  draftId: parseOptionalUuid(body.draftId, 'draftId'),
  title: parseRequiredBoundedText(body.title, {
    field: 'title',
    maxLength: LIVE_SESSION_TITLE_MAX_LENGTH,
    errorCode: 'LIVE_SESSION_INVALID_INPUT',
  }),
  objective: parseRequiredBoundedText(body.objective, {
    field: 'objective',
    maxLength: LIVE_SESSION_OBJECTIVE_MAX_LENGTH,
    errorCode: 'LIVE_SESSION_INVALID_INPUT',
  }),
  isPublic: parseOptionalBoolean(body.isPublic, {
    field: 'isPublic',
    errorCode: 'LIVE_SESSION_INVALID_INPUT',
  }),
});

const parseCompleteLiveSessionInput = (
  body: Record<string, unknown>,
): CompleteLiveSessionInput => ({
  recapSummary: parseOptionalBoundedText(body.recapSummary, {
    field: 'recapSummary',
    maxLength: LIVE_SESSION_RECAP_SUMMARY_MAX_LENGTH,
    errorCode: 'LIVE_SESSION_INVALID_INPUT',
  }),
  recapClipUrl: parseOptionalHttpsUrl(body.recapClipUrl, {
    field: 'recapClipUrl',
    errorCode: 'LIVE_SESSION_INVALID_INPUT',
  }),
});

const parsePresenceStatus = (
  body: Record<string, unknown>,
  defaultStatus: LiveSessionPresenceStatus,
): LiveSessionPresenceStatus => {
  if (body.status === undefined) {
    return defaultStatus;
  }
  if (typeof body.status !== 'string') {
    throw new ServiceError(
      'INVALID_PRESENCE_STATUS',
      'status must be a string.',
      400,
    );
  }
  const normalized = body.status.trim() as LiveSessionPresenceStatus;
  if (!PRESENCE_STATUSES.includes(normalized)) {
    throw new ServiceError(
      'INVALID_PRESENCE_STATUS',
      'status must be watching, active, or left.',
      400,
    );
  }
  return normalized;
};

const parseRequiredMessageContent = (body: Record<string, unknown>) =>
  parseRequiredBoundedText(body.content, {
    field: 'content',
    maxLength: LIVE_SESSION_MESSAGE_MAX_LENGTH,
    errorCode: 'LIVE_SESSION_INVALID_MESSAGE',
  });

const parseAgentAuthorLabel = (
  body: Record<string, unknown>,
  fallback: string,
) =>
  parseOptionalBoundedText(body.authorLabel, {
    field: 'authorLabel',
    maxLength: LIVE_SESSION_AUTHOR_LABEL_MAX_LENGTH,
    errorCode: 'LIVE_SESSION_INVALID_MESSAGE',
  }) ?? fallback;

const parseRealtimeOutputModalities = (
  value: unknown,
): RealtimeOutputModality[] => {
  if (value === undefined) {
    return ['audio', 'text'];
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_INVALID_INPUT',
      'outputModalities must be a non-empty array.',
      400,
    );
  }
  const parsed: RealtimeOutputModality[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_INVALID_INPUT',
        'outputModalities values must be strings.',
        400,
      );
    }
    const normalized = entry.trim() as RealtimeOutputModality;
    if (
      !REALTIME_OUTPUT_MODALITIES.includes(
        normalized as (typeof REALTIME_OUTPUT_MODALITIES)[number],
      )
    ) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_INVALID_INPUT',
        `Unsupported output modality: ${entry}.`,
        400,
      );
    }
    if (!parsed.includes(normalized)) {
      parsed.push(normalized);
    }
  }
  return parsed;
};

const parseRealtimeVoice = (value: unknown): RealtimeVoice => {
  if (value === undefined) {
    return 'marin';
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_INVALID_INPUT',
      'voice must be a string.',
      400,
    );
  }
  const normalized = value.trim() as RealtimeVoice;
  if (
    !REALTIME_VOICES.includes(normalized as (typeof REALTIME_VOICES)[number])
  ) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_INVALID_INPUT',
      `Unsupported voice: ${value}.`,
      400,
    );
  }
  return normalized;
};

const parseRealtimePushToTalk = (value: unknown): boolean => {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== 'boolean') {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_INVALID_INPUT',
      'pushToTalk must be a boolean.',
      400,
    );
  }
  return value;
};

const parseRealtimeMetadata = (
  value: unknown,
): Record<string, string> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_INVALID_INPUT',
      'metadata must be an object.',
      400,
    );
  }
  const metadataEntries = Object.entries(value as Record<string, unknown>);
  if (metadataEntries.length > LIVE_SESSION_REALTIME_METADATA_MAX_KEYS) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_INVALID_INPUT',
      `metadata allows at most ${LIVE_SESSION_REALTIME_METADATA_MAX_KEYS} keys.`,
      400,
    );
  }

  const normalized = Object.create(null) as Record<string, string>;
  for (const [key, rawValue] of metadataEntries) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_INVALID_INPUT',
        'metadata keys must be non-empty.',
        400,
      );
    }
    if (trimmedKey.length > LIVE_SESSION_REALTIME_METADATA_KEY_MAX_LENGTH) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_INVALID_INPUT',
        `metadata key "${trimmedKey}" is too long.`,
        400,
      );
    }
    if (typeof rawValue !== 'string') {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_INVALID_INPUT',
        `metadata value for "${trimmedKey}" must be a string.`,
        400,
      );
    }
    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_INVALID_INPUT',
        `metadata value for "${trimmedKey}" must be non-empty.`,
        400,
      );
    }
    if (trimmedValue.length > LIVE_SESSION_REALTIME_METADATA_VALUE_MAX_LENGTH) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_INVALID_INPUT',
        `metadata value for "${trimmedKey}" is too long.`,
        400,
      );
    }
    normalized[trimmedKey] = trimmedValue;
  }
  return normalized;
};

const parseRealtimeToolName = (
  body: Record<string, unknown>,
): LiveSessionRealtimeTool => {
  const name = body.name;
  const toolName = body.toolName;
  if (name !== undefined && typeof name !== 'string') {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
      'name must be a string.',
      400,
    );
  }
  if (toolName !== undefined && typeof toolName !== 'string') {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
      'toolName must be a string.',
      400,
    );
  }
  if (
    typeof name === 'string' &&
    typeof toolName === 'string' &&
    name.trim() !== toolName.trim()
  ) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
      'name and toolName must match when both are provided.',
      400,
    );
  }
  const rawName = (typeof name === 'string' ? name : toolName)?.trim() ?? '';
  if (!rawName) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
      'name is required.',
      400,
    );
  }
  if (
    !LIVE_SESSION_REALTIME_TOOLS.includes(
      rawName as (typeof LIVE_SESSION_REALTIME_TOOLS)[number],
    )
  ) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
      `Unsupported realtime tool: ${rawName}.`,
      400,
    );
  }
  return rawName as LiveSessionRealtimeTool;
};

const parseRealtimeToolArguments = (
  value: unknown,
): Record<string, unknown> => {
  const parseObject = (candidate: unknown) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
        'arguments must be an object or JSON object string.',
        400,
      );
    }
    return candidate as Record<string, unknown>;
  };

  if (typeof value === 'string') {
    if (value.length > LIVE_SESSION_REALTIME_TOOL_ARGUMENTS_MAX_LENGTH) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
        `arguments JSON is too long (max ${LIVE_SESSION_REALTIME_TOOL_ARGUMENTS_MAX_LENGTH} chars).`,
        400,
      );
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseObject(parsed);
    } catch (_error) {
      throw new ServiceError(
        'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
        'arguments must be valid JSON object string.',
        400,
      );
    }
  }
  return parseObject(value);
};

const parsePredictionStakePoints = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ServiceError(
      'PREDICTION_STAKE_INVALID',
      `${field} must be a finite number.`,
      400,
    );
  }
  if (!Number.isInteger(value)) {
    throw new ServiceError(
      'PREDICTION_STAKE_INVALID',
      `${field} must be an integer.`,
      400,
    );
  }
  if (
    value < PREDICTION_MIN_STAKE_POINTS ||
    value > PREDICTION_MAX_STAKE_POINTS
  ) {
    throw new ServiceError(
      'PREDICTION_STAKE_INVALID',
      `${field} must be between ${PREDICTION_MIN_STAKE_POINTS} and ${PREDICTION_MAX_STAKE_POINTS}.`,
      400,
    );
  }
  return value;
};

const parseRealtimeToolPredictionArguments = (argumentsValue: unknown) => {
  const args = parseRealtimeToolArguments(argumentsValue);
  const allowed = new Set([
    'draftId',
    'outcome',
    'predictedOutcome',
    'stakePoints',
    'points',
  ]);
  const unknownFields = Object.keys(args).filter((key) => !allowed.has(key));
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
      `Unsupported place_prediction arguments: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  if (typeof args.draftId !== 'string' || !isUuid(args.draftId.trim())) {
    throw new ServiceError(
      'DRAFT_ID_INVALID',
      'draftId must be a valid UUID.',
      400,
    );
  }
  const draftId = args.draftId.trim();

  if (
    typeof args.predictedOutcome === 'string' &&
    typeof args.outcome === 'string' &&
    args.predictedOutcome !== args.outcome
  ) {
    throw new ServiceError(
      'PREDICTION_PAYLOAD_CONFLICT',
      'predictedOutcome and outcome must match when both are provided.',
      400,
    );
  }

  const predictedOutcome = args.predictedOutcome ?? args.outcome;
  if (predictedOutcome !== 'merge' && predictedOutcome !== 'reject') {
    throw new ServiceError(
      'PREDICTION_INVALID',
      'Prediction must be merge or reject.',
      400,
    );
  }

  if (args.stakePoints !== undefined && args.points !== undefined) {
    const stakePoints = parsePredictionStakePoints(
      args.stakePoints,
      'stakePoints',
    );
    const points = parsePredictionStakePoints(args.points, 'points');
    if (stakePoints !== points) {
      throw new ServiceError(
        'PREDICTION_PAYLOAD_CONFLICT',
        'stakePoints and points must match when both are provided.',
        400,
      );
    }
  }

  const rawStakePoints = args.stakePoints ?? args.points;
  const stakePoints =
    rawStakePoints === undefined
      ? undefined
      : parsePredictionStakePoints(
          rawStakePoints,
          args.stakePoints !== undefined ? 'stakePoints' : 'points',
        );

  return {
    draftId,
    predictedOutcome: predictedOutcome as 'merge' | 'reject',
    stakePoints,
  };
};

const parseRealtimeToolFollowStudioArguments = (argumentsValue: unknown) => {
  const args = parseRealtimeToolArguments(argumentsValue);
  const unknownFields = Object.keys(args).filter((key) => key !== 'studioId');
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
      `Unsupported follow_studio arguments: ${unknownFields.join(', ')}.`,
      400,
    );
  }
  if (typeof args.studioId !== 'string' || !isUuid(args.studioId.trim())) {
    throw new ServiceError(
      'STUDIO_ID_INVALID',
      'studioId must be a valid UUID.',
      400,
    );
  }
  return { studioId: args.studioId.trim() };
};

const toPayloadRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const canonicalizeForHash = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeForHash(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(record).sort((left, right) =>
      left.localeCompare(right),
    );
    for (const key of keys) {
      normalized[key] = canonicalizeForHash(record[key]);
    }
    return normalized;
  }
  return value;
};

const hashRealtimeToolArguments = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalizeForHash(value)))
    .digest('hex');

type RealtimeToolCacheLookupResult =
  | { kind: 'hit'; output: Record<string, unknown> }
  | { kind: 'conflict' }
  | null;

const findCachedRealtimeToolOutput = (params: {
  sessionId: string;
  draftId?: string | null;
  hostAgentId: string;
  observerId: string;
  toolName: LiveSessionRealtimeTool;
  callId: string;
  argumentsHash?: string | null;
}): RealtimeToolCacheLookupResult => {
  const gatewaySession = agentGatewayService.ensureExternalSession({
    channel: 'live_session',
    externalSessionId: params.sessionId,
    draftId: params.draftId,
    roles: ['author', 'critic', 'maker', 'judge'],
    metadata: {
      hostAgentId: params.hostAgentId,
      source: 'live_session',
    },
  });
  const detail = agentGatewayService.getSession(gatewaySession.id);
  for (let index = detail.events.length - 1; index >= 0; index -= 1) {
    const event = detail.events[index];
    if (event.type !== 'live_realtime_tool_exec') {
      continue;
    }
    const payload = toPayloadRecord(event.payload);
    if (!payload) {
      continue;
    }
    if (
      payload.callId !== params.callId ||
      payload.toolName !== params.toolName
    ) {
      continue;
    }
    if (payload.success !== true) {
      continue;
    }
    if (
      typeof payload.observerId === 'string' &&
      payload.observerId !== params.observerId
    ) {
      continue;
    }
    const cachedArgumentsHash =
      typeof payload.argumentsHash === 'string'
        ? payload.argumentsHash.trim()
        : null;
    if (
      params.argumentsHash &&
      cachedArgumentsHash &&
      cachedArgumentsHash !== params.argumentsHash
    ) {
      return { kind: 'conflict' };
    }
    const output = toPayloadRecord(payload.output);
    return {
      kind: 'hit',
      output: output ?? {},
    };
  }
  return null;
};

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
  const parsed = Number(value);
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

const getRealtime = (req: Request): RealtimeService | undefined => {
  return req.app.get('realtime');
};

const recordLiveGatewayEvent = (params: {
  sessionId: string;
  draftId?: string | null;
  hostAgentId: string;
  eventType: string;
  fromRole: string;
  toRole?: string;
  payload?: Record<string, unknown>;
}) => {
  try {
    const gatewaySession = agentGatewayService.ensureExternalSession({
      channel: 'live_session',
      externalSessionId: params.sessionId,
      draftId: params.draftId,
      roles: ['author', 'critic', 'maker', 'judge'],
      metadata: {
        hostAgentId: params.hostAgentId,
        source: 'live_session',
      },
    });
    agentGatewayService.appendEvent(gatewaySession.id, {
      fromRole: params.fromRole,
      toRole: params.toRole,
      type: params.eventType,
      payload: params.payload ?? {},
    });
  } catch (error) {
    console.error('live session gateway event failed', error);
  }
};

router.get('/live-sessions', async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      LIVE_SESSION_QUERY_FIELDS,
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );
    const status =
      typeof query.status === 'string'
        ? (query.status as LiveStudioSessionStatus)
        : undefined;
    const limit = parseBoundedInteger(query.limit, {
      field: 'limit',
      min: 1,
      max: LIVE_SESSIONS_MAX_LIMIT,
      errorCode: 'INVALID_LIMIT',
    });
    const offset = parseBoundedInteger(query.offset, {
      field: 'offset',
      min: 0,
      max: LIVE_SESSIONS_MAX_OFFSET,
      errorCode: 'INVALID_OFFSET',
    });

    if (status && !LIVE_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'INVALID_LIVE_SESSION_STATUS' });
    }
    const sessions = await liveSessionService.listSessions({
      status,
      limit,
      offset,
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.get('/live-sessions/:id', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      LIVE_SESSION_DETAIL_QUERY_FIELDS,
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );
    assertLiveSessionIdParam(req.params.id);
    const detail = await liveSessionService.getSession(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'LIVE_SESSION_NOT_FOUND' });
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/live-sessions/:id/realtime/session',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_REALTIME_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      const body = assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_REALTIME_BODY_FIELDS,
        'LIVE_SESSION_REALTIME_INVALID_FIELDS',
      );
      assertLiveSessionIdParam(req.params.id);
      const detail = await liveSessionService.getSession(req.params.id);
      if (!detail) {
        return res.status(404).json({ error: 'LIVE_SESSION_NOT_FOUND' });
      }
      if (
        detail.session.status === 'completed' ||
        detail.session.status === 'cancelled'
      ) {
        return res.status(409).json({
          error: 'LIVE_SESSION_REALTIME_UNAVAILABLE',
          message:
            'Realtime session bootstrap is disabled for closed sessions.',
        });
      }

      const outputModalities = parseRealtimeOutputModalities(
        body.outputModalities,
      );
      const voice = parseRealtimeVoice(body.voice);
      const pushToTalk = parseRealtimePushToTalk(body.pushToTalk);
      const topicHint = parseOptionalBoundedText(body.topicHint, {
        field: 'topicHint',
        maxLength: LIVE_SESSION_REALTIME_TOPIC_HINT_MAX_LENGTH,
        errorCode: 'LIVE_SESSION_REALTIME_INVALID_INPUT',
      });
      const metadata = parseRealtimeMetadata(body.metadata);

      const bootstrap = await openAIRealtimeSessionService.createSession({
        liveSessionId: detail.session.id,
        draftId: detail.session.draftId,
        liveTitle: detail.session.title,
        liveObjective: detail.session.objective,
        observerId: req.auth?.id as string,
        outputModalities,
        voice,
        pushToTalk,
        topicHint,
        metadata,
      });

      getRealtime(req)?.broadcast(
        `session:${detail.session.id}`,
        'session_realtime_bootstrap',
        {
          sessionId: detail.session.id,
          observerId: req.auth?.id,
          outputModalities,
          voice,
          pushToTalk,
        },
      );
      recordLiveGatewayEvent({
        sessionId: detail.session.id,
        draftId: detail.session.draftId,
        hostAgentId: detail.session.hostAgentId,
        eventType: 'live_realtime_bootstrap',
        fromRole: 'observer',
        toRole: 'author',
        payload: {
          outputModalities,
          voice,
          pushToTalk,
        },
      });

      return res.status(201).json(bootstrap);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/realtime/tool',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_REALTIME_TOOL_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      const body = assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_REALTIME_TOOL_BODY_FIELDS,
        'LIVE_SESSION_REALTIME_TOOL_INVALID_FIELDS',
      );
      assertLiveSessionIdParam(req.params.id);
      const detail = await liveSessionService.getSession(req.params.id);
      if (!detail) {
        return res.status(404).json({ error: 'LIVE_SESSION_NOT_FOUND' });
      }
      if (
        detail.session.status === 'completed' ||
        detail.session.status === 'cancelled'
      ) {
        return res.status(409).json({
          error: 'LIVE_SESSION_REALTIME_UNAVAILABLE',
          message: 'Realtime tool execution is disabled for closed sessions.',
        });
      }

      const toolName = parseRealtimeToolName(body);
      const callId =
        parseOptionalBoundedText(body.callId, {
          field: 'callId',
          maxLength: LIVE_SESSION_REALTIME_TOOL_CALL_ID_MAX_LENGTH,
          errorCode: 'LIVE_SESSION_REALTIME_TOOL_INVALID_INPUT',
        }) ?? null;
      const observerId = req.auth?.id as string;
      let output: Record<string, unknown>;
      let argumentsHash: string | null = null;
      if (toolName === 'place_prediction') {
        const predictionArgs = parseRealtimeToolPredictionArguments(
          body.arguments,
        );
        argumentsHash = hashRealtimeToolArguments(predictionArgs);
        if (callId) {
          const cachedResult = findCachedRealtimeToolOutput({
            sessionId: detail.session.id,
            draftId: detail.session.draftId,
            hostAgentId: detail.session.hostAgentId,
            observerId,
            toolName,
            callId,
            argumentsHash,
          });
          if (cachedResult?.kind === 'conflict') {
            throw new ServiceError(
              'LIVE_SESSION_REALTIME_TOOL_CALL_CONFLICT',
              'callId has already been used with different arguments.',
              409,
            );
          }
          if (cachedResult?.kind === 'hit') {
            return res.json({
              callId,
              toolName,
              output: cachedResult.output,
              deduplicated: true,
            });
          }
        }
        const { draftId, predictedOutcome, stakePoints } = predictionArgs;
        if (detail.session.draftId && detail.session.draftId !== draftId) {
          throw new ServiceError(
            'LIVE_SESSION_REALTIME_TOOL_SCOPE_MISMATCH',
            'place_prediction draftId must match live session draftId.',
            409,
          );
        }
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
          observerId,
          pullRequestId,
          predictedOutcome,
          undefined,
          stakePoints,
        );
        const summary = await draftArcService.getPredictionSummary(
          observerId,
          pullRequestId,
        );
        output = {
          draftId,
          pullRequestId,
          prediction,
          summary,
        };
      } else {
        const followStudioArgs = parseRealtimeToolFollowStudioArguments(
          body.arguments,
        );
        argumentsHash = hashRealtimeToolArguments(followStudioArgs);
        if (callId) {
          const cachedResult = findCachedRealtimeToolOutput({
            sessionId: detail.session.id,
            draftId: detail.session.draftId,
            hostAgentId: detail.session.hostAgentId,
            observerId,
            toolName,
            callId,
            argumentsHash,
          });
          if (cachedResult?.kind === 'conflict') {
            throw new ServiceError(
              'LIVE_SESSION_REALTIME_TOOL_CALL_CONFLICT',
              'callId has already been used with different arguments.',
              409,
            );
          }
          if (cachedResult?.kind === 'hit') {
            return res.json({
              callId,
              toolName,
              output: cachedResult.output,
              deduplicated: true,
            });
          }
        }
        const { studioId } = followStudioArgs;
        const studioExists = await db.query(
          'SELECT studio_name FROM agents WHERE id = $1',
          [studioId],
        );
        if (studioExists.rows.length === 0) {
          return res.status(404).json({ error: 'STUDIO_NOT_FOUND' });
        }

        const insertResult = await db.query(
          `INSERT INTO observer_studio_follows (observer_id, studio_id)
           VALUES ($1, $2)
           ON CONFLICT (observer_id, studio_id) DO NOTHING
           RETURNING created_at`,
          [observerId, studioId],
        );
        const existingResult =
          insertResult.rows.length > 0
            ? insertResult
            : await db.query(
                `SELECT created_at
                 FROM observer_studio_follows
                 WHERE observer_id = $1 AND studio_id = $2`,
                [observerId, studioId],
              );
        const followerCountResult = await db.query(
          `SELECT COUNT(*)::int AS follower_count
           FROM observer_studio_follows
           WHERE studio_id = $1`,
          [studioId],
        );
        output = {
          studioId,
          observerId,
          isFollowing: true,
          alreadyFollowing: insertResult.rows.length === 0,
          followerCount: Number(
            followerCountResult.rows[0]?.follower_count ?? 0,
          ),
          followedAt: existingResult.rows[0]?.created_at ?? null,
          studioName: studioExists.rows[0]?.studio_name ?? null,
        };
      }

      getRealtime(req)?.broadcast(
        `session:${detail.session.id}`,
        'session_realtime_tool_result',
        {
          sessionId: detail.session.id,
          observerId,
          toolName,
          callId,
          success: true,
        },
      );
      recordLiveGatewayEvent({
        sessionId: detail.session.id,
        draftId: detail.session.draftId,
        hostAgentId: detail.session.hostAgentId,
        eventType: 'live_realtime_tool_exec',
        fromRole: 'observer',
        toRole: 'author',
        payload: {
          toolName,
          callId,
          argumentsHash,
          observerId,
          success: true,
          output,
        },
      });

      return res.json({
        callId,
        toolName,
        output,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post('/live-sessions', requireVerifiedAgent, async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      LIVE_SESSION_CREATE_QUERY_FIELDS,
      'LIVE_SESSION_INVALID_QUERY_FIELDS',
    );
    const payloadBody = assertAllowedBodyFields(
      req.body,
      LIVE_SESSION_CREATE_BODY_FIELDS,
      'LIVE_SESSION_INVALID_FIELDS',
    );
    const payload = parseCreateLiveSessionInput(payloadBody);
    const detail = await liveSessionService.createSession(
      req.auth?.id as string,
      payload,
    );
    getRealtime(req)?.broadcast('feed:live-sessions', 'live_session_created', {
      sessionId: detail.session.id,
      title: detail.session.title,
      status: detail.session.status,
      draftId: detail.session.draftId,
    });
    recordLiveGatewayEvent({
      sessionId: detail.session.id,
      draftId: detail.session.draftId,
      hostAgentId: req.auth?.id as string,
      eventType: 'live_session_created',
      fromRole: 'author',
      payload: {
        status: detail.session.status,
        title: detail.session.title,
        objective: detail.session.objective,
      },
    });
    res.status(201).json(detail);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/live-sessions/:id/start',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_START_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_START_BODY_FIELDS,
        'LIVE_SESSION_START_INVALID_FIELDS',
      );
      assertLiveSessionIdParam(req.params.id);
      const detail = await liveSessionService.startSession(
        req.params.id,
        req.auth?.id as string,
      );
      getRealtime(req)?.broadcast(
        'feed:live-sessions',
        'live_session_started',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
          startedAt: detail.session.startedAt,
        },
      );
      getRealtime(req)?.broadcast(
        `session:${detail.session.id}`,
        'session_status',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
        },
      );
      recordLiveGatewayEvent({
        sessionId: detail.session.id,
        draftId: detail.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_session_started',
        fromRole: 'author',
        payload: {
          status: detail.session.status,
          startedAt: detail.session.startedAt,
        },
      });
      res.json(detail);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/complete',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_COMPLETE_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      const payloadBody = assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_COMPLETE_BODY_FIELDS,
        'LIVE_SESSION_COMPLETE_INVALID_FIELDS',
      );
      const payload = parseCompleteLiveSessionInput(payloadBody);
      assertLiveSessionIdParam(req.params.id);
      const detail = await liveSessionService.completeSession(
        req.params.id,
        req.auth?.id as string,
        payload,
      );
      getRealtime(req)?.broadcast(
        'feed:live-sessions',
        'live_session_completed',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
          endedAt: detail.session.endedAt,
        },
      );
      getRealtime(req)?.broadcast(
        `session:${detail.session.id}`,
        'session_status',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
          recapSummary: detail.session.recapSummary,
          recapClipUrl: detail.session.recapClipUrl,
        },
      );
      recordLiveGatewayEvent({
        sessionId: detail.session.id,
        draftId: detail.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_session_completed',
        fromRole: 'judge',
        payload: {
          status: detail.session.status,
          endedAt: detail.session.endedAt,
          recapSummary: detail.session.recapSummary,
          recapClipUrl: detail.session.recapClipUrl,
        },
      });
      try {
        const gatewaySession = agentGatewayService.ensureExternalSession({
          channel: 'live_session',
          externalSessionId: detail.session.id,
          draftId: detail.session.draftId,
          metadata: {
            source: 'live_session',
            hostAgentId: req.auth?.id as string,
          },
        });
        agentGatewayService.closeSession(gatewaySession.id);
      } catch (error) {
        console.error('live session gateway close failed', error);
      }
      res.json(detail);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/presence/observer',
  requireHuman,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_PRESENCE_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      const body = assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_PRESENCE_BODY_FIELDS,
        'LIVE_SESSION_PRESENCE_INVALID_FIELDS',
      );
      assertLiveSessionIdParam(req.params.id);
      const status = parsePresenceStatus(body, 'watching');
      const presence = await liveSessionService.upsertPresence(req.params.id, {
        participantType: 'human',
        participantId: req.auth?.id as string,
        status,
      } as UpsertLivePresenceInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_presence',
        {
          sessionId: req.params.id,
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_presence_updated',
        fromRole: 'observer',
        toRole: 'author',
        payload: {
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      });
      res.json(presence);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/presence/agent',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_PRESENCE_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      const body = assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_PRESENCE_BODY_FIELDS,
        'LIVE_SESSION_PRESENCE_INVALID_FIELDS',
      );
      assertLiveSessionIdParam(req.params.id);
      const status = parsePresenceStatus(body, 'active');
      const presence = await liveSessionService.upsertPresence(req.params.id, {
        participantType: 'agent',
        participantId: req.auth?.id as string,
        status,
      } as UpsertLivePresenceInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_presence',
        {
          sessionId: req.params.id,
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_presence_updated',
        fromRole: 'maker',
        toRole: 'author',
        payload: {
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      });
      res.json(presence);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/messages/observer',
  requireHuman,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_MESSAGES_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      const body = assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_OBSERVER_MESSAGE_BODY_FIELDS,
        'LIVE_SESSION_MESSAGE_INVALID_FIELDS',
      );
      assertLiveSessionIdParam(req.params.id);
      const content = parseRequiredMessageContent(body);
      const message = await liveSessionService.addMessage(req.params.id, {
        authorType: 'human',
        authorId: req.auth?.id as string,
        authorLabel: req.auth?.email ?? 'Observer',
        content,
      } as AddLiveMessageInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_chat_message',
        {
          sessionId: req.params.id,
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
          content: message.content,
          createdAt: message.createdAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_chat_message',
        fromRole: 'observer',
        toRole: 'author',
        payload: {
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
        },
      });
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/messages/agent',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        LIVE_SESSION_MESSAGES_QUERY_FIELDS,
        'LIVE_SESSION_INVALID_QUERY_FIELDS',
      );
      const body = assertAllowedBodyFields(
        req.body,
        LIVE_SESSION_AGENT_MESSAGE_BODY_FIELDS,
        'LIVE_SESSION_MESSAGE_INVALID_FIELDS',
      );
      assertLiveSessionIdParam(req.params.id);
      const content = parseRequiredMessageContent(body);
      const agentLabel = parseAgentAuthorLabel(
        body,
        `Agent ${String(req.auth?.id ?? '').slice(0, 8)}`,
      );
      const message = await liveSessionService.addMessage(req.params.id, {
        authorType: 'agent',
        authorId: req.auth?.id as string,
        authorLabel: agentLabel,
        content,
      } as AddLiveMessageInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_chat_message',
        {
          sessionId: req.params.id,
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
          content: message.content,
          createdAt: message.createdAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_chat_message',
        fromRole: 'maker',
        toRole: 'author',
        payload: {
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
        },
      });
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
