import { createHash } from 'node:crypto';
import { db } from '../../db/pool';
import { ServiceError } from '../common/errors';
import type {
  AgentGatewayEvent,
  AgentGatewayService,
  AgentGatewaySession,
  AgentGatewaySessionDetail,
  AppendAgentGatewayEventInput,
  CreateAgentGatewaySessionInput,
  EnsureAgentGatewaySessionInput,
} from './types';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const MAX_EVENT_BUFFER = 300;
const TELEMETRY_SOURCE = 'agent_gateway';

interface SessionState {
  session: AgentGatewaySession;
  events: AgentGatewayEvent[];
}

const toNormalizedString = (value: string) => value.trim().toLowerCase();

const normalizeRoles = (roles?: string[]) => {
  if (!Array.isArray(roles)) {
    return [];
  }
  const normalized = roles
    .filter((role): role is string => typeof role === 'string')
    .map((role) => toNormalizedString(role))
    .filter((role) => role.length > 0);

  return Array.from(new Set(normalized));
};

const createId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createDeterministicSessionId = (
  channel: string,
  externalSessionId: string,
) => {
  const digest = createHash('sha1')
    .update(`${channel}:${toNormalizedString(externalSessionId)}`)
    .digest('hex')
    .slice(0, 24);
  return `ags-${digest}`;
};

const toIsoTimestamp = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
    } catch {
      return [];
    }
  }
  return [];
};

const mapSessionRow = (row: Record<string, unknown>): AgentGatewaySession => ({
  id: String(row.id ?? ''),
  channel: String(row.channel ?? ''),
  externalSessionId: toStringOrNull(row.external_session_id),
  draftId: toStringOrNull(row.draft_id),
  roles: toStringArray(row.roles),
  metadata: toRecord(row.metadata),
  status: row.status === 'closed' ? 'closed' : 'active',
  createdAt: toIsoTimestamp(row.created_at),
  updatedAt: toIsoTimestamp(row.updated_at),
});

const mapEventRow = (row: Record<string, unknown>): AgentGatewayEvent => ({
  id: String(row.id ?? ''),
  sessionId: String(row.session_id ?? ''),
  fromRole: String(row.from_role ?? ''),
  toRole: toStringOrNull(row.to_role),
  type: String(row.event_type ?? ''),
  payload: toRecord(row.payload),
  createdAt: toIsoTimestamp(row.created_at),
});

const cloneSession = (session: AgentGatewaySession): AgentGatewaySession => ({
  ...session,
  roles: [...session.roles],
  metadata: { ...session.metadata },
});

const cloneEvent = (event: AgentGatewayEvent): AgentGatewayEvent => ({
  ...event,
  payload: { ...event.payload },
});

const cloneDetail = (state: SessionState): AgentGatewaySessionDetail => ({
  session: cloneSession(state.session),
  events: state.events.map((event) => cloneEvent(event)),
});

const toJsonString = (value: unknown, fallback: '{}' | '[]' = '{}') => {
  try {
    return JSON.stringify(value ?? (fallback === '[]' ? [] : {}));
  } catch {
    return fallback;
  }
};

export class AgentGatewayServiceImpl implements AgentGatewayService {
  private readonly sessions = new Map<string, SessionState>();
  private readonly externalSessions = new Map<string, string>();
  private readonly enableBackgroundPersistence: boolean;

  constructor(options?: { enableBackgroundPersistence?: boolean }) {
    this.enableBackgroundPersistence =
      options?.enableBackgroundPersistence ?? process.env.NODE_ENV !== 'test';
  }

  createSession(input: CreateAgentGatewaySessionInput): AgentGatewaySession {
    const channel = toNormalizedString(input.channel ?? '');
    if (channel.length === 0) {
      throw new ServiceError(
        'AGENT_GATEWAY_CHANNEL_REQUIRED',
        'channel is required.',
        400,
      );
    }

    const externalSessionId = input.externalSessionId
      ? input.externalSessionId.trim()
      : null;
    if (externalSessionId) {
      const key = this.getExternalKey(channel, externalSessionId);
      const existingSessionId = this.externalSessions.get(key);
      if (existingSessionId) {
        const existing = this.requireSessionState(existingSessionId);
        return cloneSession(existing.session);
      }
    }

    const sessionId = externalSessionId
      ? createDeterministicSessionId(channel, externalSessionId)
      : createId('ags');
    const existingById = this.sessions.get(sessionId);
    if (existingById) {
      return cloneSession(existingById.session);
    }

    const now = new Date().toISOString();
    const session: AgentGatewaySession = {
      id: sessionId,
      channel,
      externalSessionId,
      draftId: input.draftId ? input.draftId.trim() : null,
      roles: normalizeRoles(input.roles),
      metadata:
        input.metadata && typeof input.metadata === 'object'
          ? { ...input.metadata }
          : {},
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, { session, events: [] });
    if (session.externalSessionId) {
      this.externalSessions.set(
        this.getExternalKey(channel, session.externalSessionId),
        session.id,
      );
    }
    this.runBackgroundTask(
      () => this.persistSession(session),
      'persistSession:create',
      session.id,
    );
    this.runBackgroundTask(
      () =>
        this.recordTelemetry('agent_gateway_session_create', {
          channel: session.channel,
          externalSessionId: session.externalSessionId,
          draftId: session.draftId,
          status: session.status,
        }),
      'recordTelemetry:session_create',
      session.id,
    );
    return cloneSession(session);
  }

  ensureExternalSession(
    input: EnsureAgentGatewaySessionInput,
  ): AgentGatewaySession {
    const channel = toNormalizedString(input.channel ?? '');
    const externalSessionId = input.externalSessionId.trim();
    if (channel.length === 0) {
      throw new ServiceError(
        'AGENT_GATEWAY_CHANNEL_REQUIRED',
        'channel is required.',
        400,
      );
    }
    if (externalSessionId.length === 0) {
      throw new ServiceError(
        'AGENT_GATEWAY_EXTERNAL_SESSION_REQUIRED',
        'externalSessionId is required.',
        400,
      );
    }

    const key = this.getExternalKey(channel, externalSessionId);
    const existingSessionId = this.externalSessions.get(key);
    if (existingSessionId) {
      const existing = this.requireSessionState(existingSessionId);
      return cloneSession(existing.session);
    }

    return this.createSession({
      channel,
      externalSessionId,
      draftId: input.draftId,
      roles: input.roles,
      metadata: input.metadata,
    });
  }

  listSessions(limit = DEFAULT_LIST_LIMIT): AgentGatewaySession[] {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.floor(limit), MAX_LIST_LIMIT))
      : DEFAULT_LIST_LIMIT;

    return Array.from(this.sessions.values())
      .map((state) => state.session)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, safeLimit)
      .map((session) => cloneSession(session));
  }

  async listPersistedSessions(limit = DEFAULT_LIST_LIMIT) {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.floor(limit), MAX_LIST_LIMIT))
      : DEFAULT_LIST_LIMIT;
    const result = await db.query(
      `SELECT
         id,
         channel,
         external_session_id,
         draft_id,
         roles,
         metadata,
         status,
         created_at,
         updated_at
       FROM agent_gateway_sessions
       ORDER BY updated_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map((row) => mapSessionRow(toRecord(row)));
  }

  getSession(sessionId: string): AgentGatewaySessionDetail {
    return cloneDetail(this.requireSessionState(sessionId));
  }

  async getPersistedSession(sessionId: string) {
    const result = await db.query(
      `SELECT
         id,
         channel,
         external_session_id,
         draft_id,
         roles,
         metadata,
         status,
         created_at,
         updated_at
       FROM agent_gateway_sessions
       WHERE id = $1`,
      [sessionId],
    );
    if (result.rows.length === 0) {
      return null;
    }
    const eventsResult = await db.query(
      `SELECT
         id,
         session_id,
         from_role,
         to_role,
         event_type,
         payload,
         created_at
       FROM agent_gateway_events
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId],
    );
    return {
      session: mapSessionRow(toRecord(result.rows[0])),
      events: eventsResult.rows.map((row) => mapEventRow(toRecord(row))),
    };
  }

  appendEvent(
    sessionId: string,
    input: AppendAgentGatewayEventInput,
  ): AgentGatewayEvent {
    const state = this.requireSessionState(sessionId);
    if (state.session.status === 'closed') {
      throw new ServiceError(
        'AGENT_GATEWAY_SESSION_CLOSED',
        'Session is closed.',
        409,
      );
    }

    const fromRole = toNormalizedString(input.fromRole ?? '');
    const eventType = toNormalizedString(input.type ?? '');
    const toRoleRaw = input.toRole;
    const toRole =
      typeof toRoleRaw === 'string' && toRoleRaw.trim().length > 0
        ? toNormalizedString(toRoleRaw)
        : null;

    if (fromRole.length === 0) {
      throw new ServiceError(
        'AGENT_GATEWAY_FROM_ROLE_REQUIRED',
        'fromRole is required.',
        400,
      );
    }
    if (eventType.length === 0) {
      throw new ServiceError(
        'AGENT_GATEWAY_EVENT_TYPE_REQUIRED',
        'type is required.',
        400,
      );
    }

    const event: AgentGatewayEvent = {
      id: createId('age'),
      sessionId: state.session.id,
      fromRole,
      toRole,
      type: eventType,
      payload:
        input.payload && typeof input.payload === 'object'
          ? { ...input.payload }
          : {},
      createdAt: new Date().toISOString(),
    };
    state.events.push(event);
    if (state.events.length > MAX_EVENT_BUFFER) {
      state.events.splice(0, state.events.length - MAX_EVENT_BUFFER);
    }
    state.session.updatedAt = event.createdAt;
    this.runBackgroundTask(
      () => this.persistEvent(event),
      'persistEvent:append',
      state.session.id,
    );
    this.runBackgroundTask(
      () => this.persistSession(state.session),
      'persistSession:append',
      state.session.id,
    );
    this.runBackgroundTask(
      () =>
        this.recordTelemetry('agent_gateway_event_append', {
          sessionId: state.session.id,
          channel: state.session.channel,
          externalSessionId: state.session.externalSessionId,
          fromRole: event.fromRole,
          toRole: event.toRole,
          type: event.type,
        }),
      'recordTelemetry:event_append',
      state.session.id,
    );
    return cloneEvent(event);
  }

  closeSession(sessionId: string): AgentGatewaySession {
    const state = this.requireSessionState(sessionId);
    if (state.session.status === 'closed') {
      return cloneSession(state.session);
    }
    state.session.status = 'closed';
    state.session.updatedAt = new Date().toISOString();
    this.runBackgroundTask(
      () => this.persistSession(state.session),
      'persistSession:close',
      state.session.id,
    );
    this.runBackgroundTask(
      () =>
        this.recordTelemetry('agent_gateway_session_close', {
          sessionId: state.session.id,
          channel: state.session.channel,
          externalSessionId: state.session.externalSessionId,
          status: state.session.status,
        }),
      'recordTelemetry:session_close',
      state.session.id,
    );
    return cloneSession(state.session);
  }

  async persistSession(session: AgentGatewaySession): Promise<void> {
    await db.query(
      `INSERT INTO agent_gateway_sessions (
         id,
         channel,
         external_session_id,
         draft_id,
         roles,
         metadata,
         status,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id)
       DO UPDATE SET
         channel = EXCLUDED.channel,
         external_session_id = EXCLUDED.external_session_id,
         draft_id = EXCLUDED.draft_id,
         roles = EXCLUDED.roles,
         metadata = EXCLUDED.metadata,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        session.id,
        session.channel,
        session.externalSessionId,
        session.draftId,
        toJsonString(session.roles, '[]'),
        toJsonString(session.metadata, '{}'),
        session.status,
        session.createdAt,
        session.updatedAt,
      ],
    );
  }

  async persistEvent(event: AgentGatewayEvent): Promise<void> {
    await db.query(
      `INSERT INTO agent_gateway_events (
         id,
         session_id,
         from_role,
         to_role,
         event_type,
         payload,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.sessionId,
        event.fromRole,
        event.toRole,
        event.type,
        toJsonString(event.payload, '{}'),
        event.createdAt,
      ],
    );
  }

  private getExternalKey(channel: string, externalSessionId: string) {
    return `${channel}:${toNormalizedString(externalSessionId)}`;
  }

  private requireSessionState(sessionId: string): SessionState {
    const key = sessionId.trim();
    const state = this.sessions.get(key);
    if (!state) {
      throw new ServiceError(
        'AGENT_GATEWAY_SESSION_NOT_FOUND',
        'Agent gateway session not found.',
        404,
      );
    }
    return state;
  }

  private async recordTelemetry(
    eventType: string,
    metadata: Record<string, unknown>,
  ) {
    try {
      await db.query(
        `INSERT INTO ux_events (event_type, user_type, status, source, metadata)
         VALUES ($1, 'system', 'gateway', $2, $3)`,
        [eventType, TELEMETRY_SOURCE, toJsonString(metadata, '{}')],
      );
    } catch (error) {
      console.error('agent gateway telemetry write failed', error);
    }
  }

  private runBackgroundTask(
    taskFactory: () => Promise<void>,
    label: string,
    sessionId: string,
  ) {
    if (!this.enableBackgroundPersistence) {
      return;
    }
    taskFactory().catch((error) => {
      console.error(
        `agent gateway background task failed (${label}) for ${sessionId}`,
        error,
      );
    });
  }
}

export const agentGatewayService = new AgentGatewayServiceImpl();
