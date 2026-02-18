import type { Pool, PoolClient } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  AddSwarmJudgeEventInput,
  CompleteSwarmSessionInput,
  CreateSwarmMemberInput,
  CreateSwarmSessionInput,
  SwarmJudgeEvent,
  SwarmJudgeEventType,
  SwarmListFilters,
  SwarmMember,
  SwarmRole,
  SwarmService,
  SwarmSession,
  SwarmSessionDetail,
  SwarmStatus,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const SWARM_MIN_MEMBERS = 2;
const SWARM_MAX_MEMBERS = 5;

interface SwarmSessionRow {
  id: string;
  host_agent_id: string;
  draft_id: string | null;
  title: string;
  objective: string;
  status: SwarmStatus;
  judge_summary: string | null;
  judge_score: number | string | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
  member_count?: number | string | null;
  judge_event_count?: number | string | null;
  last_activity_at?: Date | null;
}

interface SwarmMemberRow {
  id: string;
  session_id: string;
  agent_id: string;
  role: SwarmRole;
  is_lead: boolean;
  contribution_summary: string | null;
  created_at: Date;
  studio_name?: string | null;
  impact?: number | string | null;
  signal?: number | string | null;
  trust_tier?: number | string | null;
}

interface SwarmJudgeEventRow {
  id: string;
  session_id: string;
  event_type: SwarmJudgeEventType;
  score: number | string | null;
  notes: string;
  created_at: Date;
}

const mapSession = (row: SwarmSessionRow): SwarmSession => ({
  id: row.id,
  hostAgentId: row.host_agent_id,
  draftId: row.draft_id,
  title: row.title,
  objective: row.objective,
  status: row.status,
  judgeSummary: row.judge_summary,
  judgeScore: row.judge_score != null ? Number(row.judge_score) : null,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  memberCount: Number(row.member_count ?? 0),
  judgeEventCount: Number(row.judge_event_count ?? 0),
  lastActivityAt:
    row.last_activity_at ??
    row.updated_at ??
    row.started_at ??
    row.created_at ??
    new Date(),
});

const mapMember = (row: SwarmMemberRow): SwarmMember => ({
  id: row.id,
  sessionId: row.session_id,
  agentId: row.agent_id,
  role: row.role,
  isLead: row.is_lead,
  contributionSummary: row.contribution_summary,
  createdAt: row.created_at,
  studioName: row.studio_name ?? null,
  impact: Number(row.impact ?? 0),
  signal: Number(row.signal ?? 0),
  trustTier: Number(row.trust_tier ?? 0),
});

const mapJudgeEvent = (row: SwarmJudgeEventRow): SwarmJudgeEvent => ({
  id: row.id,
  sessionId: row.session_id,
  eventType: row.event_type,
  score: row.score != null ? Number(row.score) : null,
  notes: row.notes,
  createdAt: row.created_at,
});

const normalizeRole = (value: SwarmRole): SwarmRole => value;

const normalizeMembers = (
  hostAgentId: string,
  members: CreateSwarmMemberInput[],
): CreateSwarmMemberInput[] => {
  const sanitized: CreateSwarmMemberInput[] = members.map((member) => ({
    agentId: member.agentId,
    role: normalizeRole(member.role),
    isLead: Boolean(member.isLead),
  }));

  const hostMember = sanitized.find((member) => member.agentId === hostAgentId);
  if (hostMember) {
    if (!hostMember.isLead) {
      hostMember.isLead = true;
    }
    return sanitized;
  }

  return [
    {
      agentId: hostAgentId,
      role: 'strategist',
      isLead: true,
    },
    ...sanitized,
  ];
};

const ensureInRange = (score: number | undefined, fieldName: string): void => {
  if (score === undefined) {
    return;
  }
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new ServiceError(
      'SWARM_INVALID_SCORE',
      `${fieldName} must be between 0 and 100.`,
      400,
    );
  }
};

export class SwarmServiceImpl implements SwarmService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createSession(
    hostAgentId: string,
    input: CreateSwarmSessionInput,
    client?: DbClient,
  ): Promise<SwarmSessionDetail> {
    const title = input.title?.trim();
    const objective = input.objective?.trim();
    if (!(title && objective)) {
      throw new ServiceError(
        'SWARM_INVALID_INPUT',
        'Title and objective are required.',
        400,
      );
    }

    const members = normalizeMembers(hostAgentId, input.members ?? []);
    if (
      members.length < SWARM_MIN_MEMBERS ||
      members.length > SWARM_MAX_MEMBERS
    ) {
      throw new ServiceError(
        'SWARM_INVALID_MEMBER_COUNT',
        `Swarm must include ${SWARM_MIN_MEMBERS}-${SWARM_MAX_MEMBERS} members.`,
        400,
      );
    }

    const roleSet = new Set<string>();
    const memberSet = new Set<string>();
    for (const member of members) {
      if (!member.agentId) {
        throw new ServiceError(
          'SWARM_INVALID_MEMBER',
          'Every swarm member must include agentId.',
          400,
        );
      }
      if (memberSet.has(member.agentId)) {
        throw new ServiceError(
          'SWARM_DUPLICATE_MEMBER',
          'Duplicate agent in swarm members.',
          400,
        );
      }
      memberSet.add(member.agentId);
      if (roleSet.has(member.role)) {
        throw new ServiceError(
          'SWARM_DUPLICATE_ROLE',
          'Each swarm role can be assigned once per session.',
          400,
        );
      }
      roleSet.add(member.role);
    }

    let poolClient: PoolClient | null = null;
    if (!client) {
      poolClient = await this.pool.connect();
    }
    const db: DbClient = client ?? (poolClient as PoolClient);

    try {
      if (poolClient) {
        await db.query('BEGIN');
      }
      await this.ensureAgentsExist([...memberSet], db);
      if (input.draftId) {
        await this.ensureDraftExists(input.draftId, db);
      }

      const created = await db.query(
        `INSERT INTO swarm_sessions (
           host_agent_id,
           draft_id,
           title,
           objective,
           status
         )
         VALUES ($1, $2, $3, $4, 'forming')
         RETURNING *`,
        [hostAgentId, input.draftId ?? null, title, objective],
      );
      const sessionRow = created.rows[0] as SwarmSessionRow;

      for (const member of members) {
        await db.query(
          `INSERT INTO swarm_members (
             session_id,
             agent_id,
             role,
             is_lead
           )
           VALUES ($1, $2, $3, $4)`,
          [sessionRow.id, member.agentId, member.role, Boolean(member.isLead)],
        );
      }

      const details = await this.getSession(sessionRow.id, db);
      if (!details) {
        throw new ServiceError(
          'SWARM_NOT_FOUND',
          'Swarm session not found after creation.',
          500,
        );
      }

      if (poolClient) {
        await db.query('COMMIT');
      }
      return details;
    } catch (error) {
      if (poolClient) {
        await db.query('ROLLBACK');
      }
      throw error;
    } finally {
      poolClient?.release();
    }
  }

  async listSessions(
    filters: SwarmListFilters = {},
    client?: DbClient,
  ): Promise<SwarmSession[]> {
    const db = getDb(this.pool, client);
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 50);
    const offset = Math.max(filters.offset ?? 0, 0);

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.status) {
      params.push(filters.status);
      where.push(`s.status = $${params.length}`);
    }
    params.push(limit, offset);
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const result = await db.query(
      `SELECT s.*,
              COUNT(DISTINCT sm.id)::int AS member_count,
              COUNT(DISTINCT je.id)::int AS judge_event_count,
              COALESCE(MAX(je.created_at), s.updated_at) AS last_activity_at
       FROM swarm_sessions s
       LEFT JOIN swarm_members sm ON sm.session_id = s.id
       LEFT JOIN swarm_judge_events je ON je.session_id = s.id
       ${whereSql}
       GROUP BY s.id
       ORDER BY COALESCE(s.started_at, s.created_at) DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );
    return result.rows.map((row) => mapSession(row as SwarmSessionRow));
  }

  async getSession(
    id: string,
    client?: DbClient,
  ): Promise<SwarmSessionDetail | null> {
    const db = getDb(this.pool, client);
    const sessionResult = await db.query(
      `SELECT s.*,
              COUNT(DISTINCT sm.id)::int AS member_count,
              COUNT(DISTINCT je.id)::int AS judge_event_count,
              COALESCE(MAX(je.created_at), s.updated_at) AS last_activity_at
       FROM swarm_sessions s
       LEFT JOIN swarm_members sm ON sm.session_id = s.id
       LEFT JOIN swarm_judge_events je ON je.session_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id],
    );
    if (sessionResult.rows.length === 0) {
      return null;
    }

    const membersResult = await db.query(
      `SELECT sm.*,
              a.studio_name,
              a.impact,
              a.signal,
              a.trust_tier
       FROM swarm_members sm
       JOIN agents a ON a.id = sm.agent_id
       WHERE sm.session_id = $1
       ORDER BY sm.is_lead DESC, sm.created_at ASC`,
      [id],
    );
    const judgeEventsResult = await db.query(
      `SELECT *
       FROM swarm_judge_events
       WHERE session_id = $1
       ORDER BY created_at DESC`,
      [id],
    );

    return {
      session: mapSession(sessionResult.rows[0] as SwarmSessionRow),
      members: membersResult.rows.map((row) =>
        mapMember(row as SwarmMemberRow),
      ),
      judgeEvents: judgeEventsResult.rows.map((row) =>
        mapJudgeEvent(row as SwarmJudgeEventRow),
      ),
    };
  }

  async startSession(
    sessionId: string,
    hostAgentId: string,
    client?: DbClient,
  ): Promise<SwarmSessionDetail> {
    const db = getDb(this.pool, client);
    const session = await this.requireHostSession(sessionId, hostAgentId, db);
    if (session.status !== 'forming') {
      throw new ServiceError(
        'SWARM_INVALID_STATE',
        'Only forming swarm sessions can be started.',
        409,
      );
    }

    await db.query(
      `UPDATE swarm_sessions
       SET status = 'active',
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId],
    );
    const detail = await this.getSession(sessionId, db);
    if (!detail) {
      throw new ServiceError(
        'SWARM_NOT_FOUND',
        'Swarm session not found.',
        404,
      );
    }
    return detail;
  }

  async addJudgeEvent(
    sessionId: string,
    hostAgentId: string,
    input: AddSwarmJudgeEventInput,
    client?: DbClient,
  ): Promise<SwarmJudgeEvent> {
    const db = getDb(this.pool, client);
    const session = await this.requireHostSession(sessionId, hostAgentId, db);
    if (session.status !== 'active' && session.status !== 'completed') {
      throw new ServiceError(
        'SWARM_INVALID_STATE',
        'Judge events can be added only to active or completed sessions.',
        409,
      );
    }
    const notes = input.notes?.trim();
    if (!notes) {
      throw new ServiceError(
        'SWARM_INVALID_EVENT',
        'Judge event notes are required.',
        400,
      );
    }
    ensureInRange(input.score, 'score');

    const inserted = await db.query(
      `INSERT INTO swarm_judge_events (
         session_id,
         event_type,
         score,
         notes
       )
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sessionId, input.eventType, input.score ?? null, notes],
    );
    await db.query(
      `UPDATE swarm_sessions
       SET updated_at = NOW()
       WHERE id = $1`,
      [sessionId],
    );
    return mapJudgeEvent(inserted.rows[0] as SwarmJudgeEventRow);
  }

  async completeSession(
    sessionId: string,
    hostAgentId: string,
    input: CompleteSwarmSessionInput,
    client?: DbClient,
  ): Promise<SwarmSessionDetail> {
    const db = getDb(this.pool, client);
    const session = await this.requireHostSession(sessionId, hostAgentId, db);
    if (session.status !== 'forming' && session.status !== 'active') {
      throw new ServiceError(
        'SWARM_INVALID_STATE',
        'Only forming/active swarm sessions can be completed.',
        409,
      );
    }

    const judgeSummary = input.judgeSummary?.trim();
    if (!judgeSummary) {
      throw new ServiceError(
        'SWARM_INVALID_INPUT',
        'judgeSummary is required.',
        400,
      );
    }
    ensureInRange(input.judgeScore, 'judgeScore');

    await db.query(
      `UPDATE swarm_sessions
       SET status = 'completed',
           judge_summary = $2,
           judge_score = $3,
           ended_at = COALESCE(ended_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId, judgeSummary, input.judgeScore ?? null],
    );

    await db.query(
      `INSERT INTO swarm_judge_events (
         session_id,
         event_type,
         score,
         notes
       )
       VALUES ($1, 'final', $2, $3)`,
      [sessionId, input.judgeScore ?? null, judgeSummary],
    );

    const detail = await this.getSession(sessionId, db);
    if (!detail) {
      throw new ServiceError(
        'SWARM_NOT_FOUND',
        'Swarm session not found.',
        404,
      );
    }
    return detail;
  }

  private async ensureAgentsExist(
    agentIds: string[],
    db: DbClient,
  ): Promise<void> {
    const result = await db.query(
      `SELECT id
       FROM agents
       WHERE id = ANY($1::uuid[])`,
      [agentIds],
    );
    if (result.rows.length !== agentIds.length) {
      throw new ServiceError(
        'SWARM_MEMBER_AGENT_NOT_FOUND',
        'One or more swarm member agents were not found.',
        404,
      );
    }
  }

  private async ensureDraftExists(
    draftId: string,
    db: DbClient,
  ): Promise<void> {
    const result = await db.query('SELECT id FROM drafts WHERE id = $1', [
      draftId,
    ]);
    if (result.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }
  }

  private async requireHostSession(
    sessionId: string,
    hostAgentId: string,
    db: DbClient,
  ): Promise<SwarmSession> {
    const detail = await this.getSession(sessionId, db);
    if (!detail) {
      throw new ServiceError(
        'SWARM_NOT_FOUND',
        'Swarm session not found.',
        404,
      );
    }
    if (detail.session.hostAgentId !== hostAgentId) {
      throw new ServiceError(
        'SWARM_FORBIDDEN',
        'Only swarm host can mutate this session.',
        403,
      );
    }
    return detail.session;
  }
}
