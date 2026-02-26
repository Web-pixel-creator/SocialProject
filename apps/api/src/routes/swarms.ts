import { Router } from 'express';
import { db } from '../db/pool';
import { requireVerifiedAgent } from '../middleware/auth';
import { agentGatewayService } from '../services/agentGateway/agentGatewayService';
import { agentGatewayAdapterService } from '../services/agentGatewayAdapter/agentGatewayAdapterService';
import { ServiceError } from '../services/common/errors';
import { SwarmServiceImpl } from '../services/swarm/swarmService';
import type {
  AddSwarmJudgeEventInput,
  CompleteSwarmSessionInput,
  CreateSwarmMemberInput,
  CreateSwarmSessionInput,
  SwarmJudgeEventType,
  SwarmRole,
  SwarmStatus,
} from '../services/swarm/types';

const router = Router();
const swarmService = new SwarmServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SWARM_STATUSES: SwarmStatus[] = [
  'forming',
  'active',
  'completed',
  'cancelled',
];
const SWARM_ROLES: SwarmRole[] = [
  'colorist',
  'compositor',
  'storyteller',
  'critic',
  'strategist',
];
const SWARM_JUDGE_EVENT_TYPES: SwarmJudgeEventType[] = [
  'checkpoint',
  'decision',
  'final',
];
const SWARM_QUERY_FIELDS = ['status', 'limit', 'offset'] as const;
const SWARM_DETAIL_QUERY_FIELDS = [] as const;
const SWARM_CREATE_QUERY_FIELDS = [] as const;
const SWARM_CREATE_BODY_FIELDS = [
  'draftId',
  'title',
  'objective',
  'members',
] as const;
const SWARM_START_QUERY_FIELDS = [] as const;
const SWARM_START_BODY_FIELDS = [] as const;
const SWARM_JUDGE_EVENT_QUERY_FIELDS = [] as const;
const SWARM_JUDGE_EVENT_BODY_FIELDS = ['eventType', 'score', 'notes'] as const;
const SWARM_COMPLETE_QUERY_FIELDS = [] as const;
const SWARM_COMPLETE_BODY_FIELDS = ['judgeSummary', 'judgeScore'] as const;
const SWARM_MEMBER_FIELDS = ['agentId', 'role', 'isLead'] as const;
const SWARM_TITLE_MAX_LENGTH = 160;
const SWARM_OBJECTIVE_MAX_LENGTH = 1000;
const SWARM_JUDGE_NOTES_MAX_LENGTH = 2000;
const SWARM_JUDGE_SUMMARY_MAX_LENGTH = 2000;
const SWARMS_MAX_LIMIT = 100;
const SWARMS_MAX_OFFSET = 10_000;
const isUuid = (value: string) => UUID_PATTERN.test(value);

const assertSwarmSessionIdParam = (value: string) => {
  if (!isUuid(value)) {
    throw new ServiceError('SWARM_ID_INVALID', 'Invalid swarm id.', 400);
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

const parseRequiredUuid = (
  value: unknown,
  { field, errorCode }: { field: string; errorCode: string },
) => {
  if (typeof value !== 'string') {
    throw new ServiceError(errorCode, `${field} must be a UUID.`, 400);
  }
  const normalized = value.trim();
  if (!(normalized && isUuid(normalized))) {
    throw new ServiceError(errorCode, `${field} must be a UUID.`, 400);
  }
  return normalized;
};

const parseOptionalUuid = (
  value: unknown,
  { field, errorCode }: { field: string; errorCode: string },
) => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(errorCode, `${field} must be a UUID.`, 400);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (!isUuid(normalized)) {
    throw new ServiceError(errorCode, `${field} must be a UUID.`, 400);
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

const parseOptionalScore = (
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
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ServiceError(errorCode, `${field} must be a number.`, 400);
  }
  if (value < 0 || value > 100) {
    throw new ServiceError(
      errorCode,
      `${field} must be between 0 and 100.`,
      400,
    );
  }
  return value;
};

const parseSwarmRole = (value: unknown, field: string): SwarmRole => {
  if (typeof value !== 'string') {
    throw new ServiceError(
      'SWARM_INVALID_MEMBER',
      `${field} must be a role.`,
      400,
    );
  }
  const normalized = value.trim() as SwarmRole;
  if (!SWARM_ROLES.includes(normalized)) {
    throw new ServiceError(
      'SWARM_INVALID_MEMBER',
      `${field} must be one of: ${SWARM_ROLES.join(', ')}.`,
      400,
    );
  }
  return normalized;
};

const parseCreateSwarmMembers = (value: unknown): CreateSwarmMemberInput[] => {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ServiceError(
      'SWARM_INVALID_MEMBER',
      'members must be an array.',
      400,
    );
  }
  return value.map((member, index) => {
    if (!member || typeof member !== 'object' || Array.isArray(member)) {
      throw new ServiceError(
        'SWARM_INVALID_MEMBER',
        `members[${index}] must be an object.`,
        400,
      );
    }
    const record = member as Record<string, unknown>;
    const unknown = Object.keys(record).filter(
      (key) =>
        !SWARM_MEMBER_FIELDS.includes(
          key as (typeof SWARM_MEMBER_FIELDS)[number],
        ),
    );
    if (unknown.length > 0) {
      throw new ServiceError(
        'SWARM_INVALID_MEMBER',
        `members[${index}] has unsupported fields: ${unknown.join(', ')}`,
        400,
      );
    }
    return {
      agentId: parseRequiredUuid(record.agentId, {
        field: `members[${index}].agentId`,
        errorCode: 'SWARM_INVALID_MEMBER',
      }),
      role: parseSwarmRole(record.role, `members[${index}].role`),
      isLead: parseOptionalBoolean(record.isLead, {
        field: `members[${index}].isLead`,
        errorCode: 'SWARM_INVALID_MEMBER',
      }),
    };
  });
};

const parseCreateSwarmSessionInput = (
  body: Record<string, unknown>,
): CreateSwarmSessionInput => ({
  draftId: parseOptionalUuid(body.draftId, {
    field: 'draftId',
    errorCode: 'DRAFT_ID_INVALID',
  }),
  title: parseRequiredBoundedText(body.title, {
    field: 'title',
    maxLength: SWARM_TITLE_MAX_LENGTH,
    errorCode: 'SWARM_INVALID_INPUT',
  }),
  objective: parseRequiredBoundedText(body.objective, {
    field: 'objective',
    maxLength: SWARM_OBJECTIVE_MAX_LENGTH,
    errorCode: 'SWARM_INVALID_INPUT',
  }),
  members: parseCreateSwarmMembers(body.members),
});

const parseJudgeEventType = (value: unknown): SwarmJudgeEventType => {
  if (typeof value !== 'string') {
    throw new ServiceError(
      'SWARM_INVALID_EVENT',
      'eventType must be a string.',
      400,
    );
  }
  const normalized = value.trim() as SwarmJudgeEventType;
  if (!SWARM_JUDGE_EVENT_TYPES.includes(normalized)) {
    throw new ServiceError(
      'SWARM_INVALID_EVENT',
      `eventType must be one of: ${SWARM_JUDGE_EVENT_TYPES.join(', ')}.`,
      400,
    );
  }
  return normalized;
};

const parseJudgeEventInput = (
  body: Record<string, unknown>,
): AddSwarmJudgeEventInput => ({
  eventType: parseJudgeEventType(body.eventType),
  score: parseOptionalScore(body.score, {
    field: 'score',
    errorCode: 'SWARM_INVALID_SCORE',
  }),
  notes: parseRequiredBoundedText(body.notes, {
    field: 'notes',
    maxLength: SWARM_JUDGE_NOTES_MAX_LENGTH,
    errorCode: 'SWARM_INVALID_EVENT',
  }),
});

const parseCompleteSwarmInput = (
  body: Record<string, unknown>,
): CompleteSwarmSessionInput => ({
  judgeSummary: parseRequiredBoundedText(body.judgeSummary, {
    field: 'judgeSummary',
    maxLength: SWARM_JUDGE_SUMMARY_MAX_LENGTH,
    errorCode: 'SWARM_INVALID_INPUT',
  }),
  judgeScore: parseOptionalScore(body.judgeScore, {
    field: 'judgeScore',
    errorCode: 'SWARM_INVALID_SCORE',
  }),
});

const parseSwarmStatusFilter = (value: unknown): SwarmStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'INVALID_SWARM_STATUS',
      'status must be a string.',
      400,
    );
  }
  const normalized = value.trim() as SwarmStatus;
  if (!SWARM_STATUSES.includes(normalized)) {
    throw new ServiceError(
      'INVALID_SWARM_STATUS',
      `status must be one of: ${SWARM_STATUSES.join(', ')}.`,
      400,
    );
  }
  return normalized;
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

const mapSwarmRoleToGatewayRole = (role: SwarmRole): string => {
  if (role === 'critic') {
    return 'critic';
  }
  if (role === 'strategist') {
    return 'judge';
  }
  return 'maker';
};

const inferGatewayRoles = (memberRoles: SwarmRole[]) => {
  const resolvedRoles = memberRoles.map((role) =>
    mapSwarmRoleToGatewayRole(role),
  );
  return Array.from(new Set(['author', ...resolvedRoles]));
};

const recordSwarmGatewayEvent = async (params: {
  sessionId: string;
  draftId?: string | null;
  hostAgentId: string;
  eventType: string;
  fromRole: string;
  payload?: Record<string, unknown>;
  roles?: string[];
}) => {
  try {
    await agentGatewayAdapterService.routeExternalEvent({
      adapter: 'external_webhook',
      channel: 'swarm',
      externalSessionId: params.sessionId,
      draftId: params.draftId,
      roles: params.roles,
      metadata: {
        hostAgentId: params.hostAgentId,
        source: 'swarm',
      },
      fromRole: params.fromRole,
      type: params.eventType,
      payload: params.payload ?? {},
    });
  } catch (error) {
    console.error('swarm gateway event failed', error);
  }
};

router.get('/swarms', async (req, res, next) => {
  try {
    const query = assertAllowedQueryFields(
      req.query,
      SWARM_QUERY_FIELDS,
      'SWARM_INVALID_QUERY_FIELDS',
    );
    const status = parseSwarmStatusFilter(query.status);
    const limit = parseBoundedInteger(query.limit, {
      field: 'limit',
      min: 1,
      max: SWARMS_MAX_LIMIT,
      errorCode: 'INVALID_LIMIT',
    });
    const offset = parseBoundedInteger(query.offset, {
      field: 'offset',
      min: 0,
      max: SWARMS_MAX_OFFSET,
      errorCode: 'INVALID_OFFSET',
    });

    const sessions = await swarmService.listSessions({
      status,
      limit,
      offset,
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.get('/swarms/:id', async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      SWARM_DETAIL_QUERY_FIELDS,
      'SWARM_INVALID_QUERY_FIELDS',
    );
    assertSwarmSessionIdParam(req.params.id);
    const details = await swarmService.getSession(req.params.id);
    if (!details) {
      return res.status(404).json({ error: 'SWARM_NOT_FOUND' });
    }
    res.json(details);
  } catch (error) {
    next(error);
  }
});

router.post('/swarms', requireVerifiedAgent, async (req, res, next) => {
  try {
    assertAllowedQueryFields(
      req.query,
      SWARM_CREATE_QUERY_FIELDS,
      'SWARM_INVALID_QUERY_FIELDS',
    );
    const payload = assertAllowedBodyFields(
      req.body,
      SWARM_CREATE_BODY_FIELDS,
      'SWARM_INVALID_FIELDS',
    );
    const input = parseCreateSwarmSessionInput(payload);
    const details = await swarmService.createSession(req.auth?.id as string, {
      draftId: input.draftId,
      title: input.title,
      objective: input.objective,
      members: input.members,
    });
    const memberRoles = details.members.map((member) => member.role);
    await recordSwarmGatewayEvent({
      sessionId: details.session.id,
      draftId: details.session.draftId,
      hostAgentId: req.auth?.id as string,
      eventType: 'swarm_session_created',
      fromRole: 'author',
      roles: inferGatewayRoles(memberRoles),
      payload: {
        status: details.session.status,
        title: details.session.title,
        objective: details.session.objective,
        memberCount: details.session.memberCount,
      },
    });
    res.status(201).json(details);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/swarms/:id/start',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        SWARM_START_QUERY_FIELDS,
        'SWARM_INVALID_QUERY_FIELDS',
      );
      assertAllowedBodyFields(
        req.body,
        SWARM_START_BODY_FIELDS,
        'SWARM_START_INVALID_FIELDS',
      );
      assertSwarmSessionIdParam(req.params.id);
      const details = await swarmService.startSession(
        req.params.id,
        req.auth?.id as string,
      );
      const memberRoles = details.members.map((member) => member.role);
      await recordSwarmGatewayEvent({
        sessionId: details.session.id,
        draftId: details.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'swarm_session_started',
        fromRole: 'judge',
        roles: inferGatewayRoles(memberRoles),
        payload: {
          status: details.session.status,
          startedAt: details.session.startedAt,
          memberCount: details.session.memberCount,
        },
      });
      res.json(details);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/swarms/:id/judge-events',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        SWARM_JUDGE_EVENT_QUERY_FIELDS,
        'SWARM_INVALID_QUERY_FIELDS',
      );
      assertSwarmSessionIdParam(req.params.id);
      const payload = assertAllowedBodyFields(
        req.body,
        SWARM_JUDGE_EVENT_BODY_FIELDS,
        'SWARM_JUDGE_EVENT_INVALID_FIELDS',
      );
      const input = parseJudgeEventInput(payload);
      const event = await swarmService.addJudgeEvent(
        req.params.id,
        req.auth?.id as string,
        input,
      );
      await recordSwarmGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: `swarm_judge_${event.eventType}`,
        fromRole: 'judge',
        payload: {
          judgeEventId: event.id,
          score: event.score,
          notes: event.notes,
        },
      });
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/swarms/:id/complete',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      assertAllowedQueryFields(
        req.query,
        SWARM_COMPLETE_QUERY_FIELDS,
        'SWARM_INVALID_QUERY_FIELDS',
      );
      assertSwarmSessionIdParam(req.params.id);
      const payload = assertAllowedBodyFields(
        req.body,
        SWARM_COMPLETE_BODY_FIELDS,
        'SWARM_COMPLETE_INVALID_FIELDS',
      );
      const input = parseCompleteSwarmInput(payload);
      const details = await swarmService.completeSession(
        req.params.id,
        req.auth?.id as string,
        input,
      );
      await recordSwarmGatewayEvent({
        sessionId: details.session.id,
        draftId: details.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'swarm_session_completed',
        fromRole: 'judge',
        payload: {
          status: details.session.status,
          endedAt: details.session.endedAt,
          judgeScore: details.session.judgeScore,
        },
      });
      try {
        const gatewaySession = agentGatewayService.ensureExternalSession({
          channel: 'swarm',
          externalSessionId: details.session.id,
          draftId: details.session.draftId,
          metadata: { source: 'swarm', hostAgentId: req.auth?.id as string },
        });
        agentGatewayService.closeSession(gatewaySession.id);
      } catch (error) {
        console.error('swarm gateway close failed', error);
      }
      res.json(details);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
