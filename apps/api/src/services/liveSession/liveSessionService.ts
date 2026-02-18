import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  AddLiveMessageInput,
  CompleteLiveSessionInput,
  CreateLiveSessionInput,
  LiveSessionDetail,
  LiveSessionListFilters,
  LiveSessionMessage,
  LiveSessionPresence,
  LiveSessionPresenceStatus,
  LiveSessionService,
  LiveStudioSession,
  LiveStudioSessionStatus,
  UpsertLivePresenceInput,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

interface LiveSessionRow {
  id: string;
  host_agent_id: string;
  draft_id: string | null;
  title: string;
  objective: string;
  status: LiveStudioSessionStatus;
  is_public: boolean;
  recap_summary: string | null;
  recap_clip_url: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
  participant_count?: number | string | null;
  message_count?: number | string | null;
  last_activity_at?: Date | null;
}

interface LiveSessionPresenceRow {
  id: string;
  session_id: string;
  participant_type: 'human' | 'agent';
  participant_id: string;
  status: LiveSessionPresenceStatus;
  joined_at: Date;
  last_seen_at: Date;
}

interface LiveSessionMessageRow {
  id: string;
  session_id: string;
  author_type: 'human' | 'agent';
  author_id: string;
  author_label: string;
  content: string;
  created_at: Date;
}

const mapSession = (row: LiveSessionRow): LiveStudioSession => ({
  id: row.id,
  hostAgentId: row.host_agent_id,
  draftId: row.draft_id,
  title: row.title,
  objective: row.objective,
  status: row.status,
  isPublic: Boolean(row.is_public),
  recapSummary: row.recap_summary,
  recapClipUrl: row.recap_clip_url ?? null,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  participantCount: Number(row.participant_count ?? 0),
  messageCount: Number(row.message_count ?? 0),
  lastActivityAt: row.last_activity_at ?? row.updated_at,
});

const mapPresence = (row: LiveSessionPresenceRow): LiveSessionPresence => ({
  id: row.id,
  sessionId: row.session_id,
  participantType: row.participant_type,
  participantId: row.participant_id,
  status: row.status,
  joinedAt: row.joined_at,
  lastSeenAt: row.last_seen_at,
});

const mapMessage = (row: LiveSessionMessageRow): LiveSessionMessage => ({
  id: row.id,
  sessionId: row.session_id,
  authorType: row.author_type,
  authorId: row.author_id,
  authorLabel: row.author_label,
  content: row.content,
  createdAt: row.created_at,
});

export class LiveSessionServiceImpl implements LiveSessionService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async listSessions(
    filters: LiveSessionListFilters = {},
    client?: DbClient,
  ): Promise<LiveStudioSession[]> {
    const db = getDb(this.pool, client);
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 50);
    const offset = Math.max(filters.offset ?? 0, 0);

    const params: Array<string | number> = [];
    const where: string[] = ['ls.is_public = true'];
    if (filters.status) {
      params.push(filters.status);
      where.push(`ls.status = $${params.length}`);
    }
    params.push(limit, offset);
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const result = await db.query(
      `SELECT ls.*,
              COUNT(DISTINCT lsp.id) FILTER (WHERE lsp.status <> 'left')::int AS participant_count,
              COUNT(DISTINCT lsm.id)::int AS message_count,
              GREATEST(
                ls.updated_at,
                COALESCE(MAX(lsp.last_seen_at), ls.updated_at),
                COALESCE(MAX(lsm.created_at), ls.updated_at)
              ) AS last_activity_at
       FROM live_studio_sessions ls
       LEFT JOIN live_session_presence lsp ON lsp.session_id = ls.id
       LEFT JOIN live_session_messages lsm ON lsm.session_id = ls.id
       ${whereSql}
       GROUP BY ls.id
       ORDER BY COALESCE(ls.started_at, ls.created_at) DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );

    return result.rows.map((row) => mapSession(row as LiveSessionRow));
  }

  async getSession(
    sessionId: string,
    client?: DbClient,
  ): Promise<LiveSessionDetail | null> {
    const db = getDb(this.pool, client);
    const sessionResult = await db.query(
      `SELECT ls.*,
              COUNT(DISTINCT lsp.id) FILTER (WHERE lsp.status <> 'left')::int AS participant_count,
              COUNT(DISTINCT lsm.id)::int AS message_count,
              GREATEST(
                ls.updated_at,
                COALESCE(MAX(lsp.last_seen_at), ls.updated_at),
                COALESCE(MAX(lsm.created_at), ls.updated_at)
              ) AS last_activity_at
       FROM live_studio_sessions ls
       LEFT JOIN live_session_presence lsp ON lsp.session_id = ls.id
       LEFT JOIN live_session_messages lsm ON lsm.session_id = ls.id
       WHERE ls.id = $1
       GROUP BY ls.id`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      return null;
    }

    const presenceResult = await db.query(
      `SELECT *
       FROM live_session_presence
       WHERE session_id = $1
         AND status <> 'left'
       ORDER BY last_seen_at DESC
       LIMIT 40`,
      [sessionId],
    );

    const messagesResult = await db.query(
      `SELECT *
       FROM live_session_messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [sessionId],
    );

    return {
      session: mapSession(sessionResult.rows[0] as LiveSessionRow),
      presence: presenceResult.rows.map((row) =>
        mapPresence(row as LiveSessionPresenceRow),
      ),
      messages: messagesResult.rows.map((row) =>
        mapMessage(row as LiveSessionMessageRow),
      ),
    };
  }

  async createSession(
    hostAgentId: string,
    input: CreateLiveSessionInput,
    client?: DbClient,
  ): Promise<LiveSessionDetail> {
    const db = getDb(this.pool, client);
    const title = input.title?.trim();
    const objective = input.objective?.trim();
    if (!(title && objective)) {
      throw new ServiceError(
        'LIVE_SESSION_INVALID_INPUT',
        'title and objective are required.',
        400,
      );
    }

    await this.ensureAgentExists(hostAgentId, db);
    if (input.draftId) {
      await this.ensureDraftExists(input.draftId, db);
    }

    const inserted = await db.query(
      `INSERT INTO live_studio_sessions (
         host_agent_id,
         draft_id,
         title,
         objective,
         status,
         is_public
       )
       VALUES ($1, $2, $3, $4, 'forming', $5)
       RETURNING id`,
      [
        hostAgentId,
        input.draftId ?? null,
        title,
        objective,
        input.isPublic ?? true,
      ],
    );

    const detail = await this.getSession(inserted.rows[0].id as string, db);
    if (!detail) {
      throw new ServiceError(
        'LIVE_SESSION_NOT_FOUND',
        'Live session not found after creation.',
        500,
      );
    }
    return detail;
  }

  async startSession(
    sessionId: string,
    hostAgentId: string,
    client?: DbClient,
  ): Promise<LiveSessionDetail> {
    const db = getDb(this.pool, client);
    const session = await this.requireHostSession(sessionId, hostAgentId, db);
    if (session.status !== 'forming') {
      throw new ServiceError(
        'LIVE_SESSION_INVALID_STATE',
        'Only forming sessions can be started.',
        409,
      );
    }

    await db.query(
      `UPDATE live_studio_sessions
       SET status = 'live',
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId],
    );
    return this.requireSessionDetail(sessionId, db);
  }

  async completeSession(
    sessionId: string,
    hostAgentId: string,
    input: CompleteLiveSessionInput,
    client?: DbClient,
  ): Promise<LiveSessionDetail> {
    const db = getDb(this.pool, client);
    const detailBefore = await this.requireSessionDetail(sessionId, db);
    const session = detailBefore.session;
    if (session.hostAgentId !== hostAgentId) {
      throw new ServiceError(
        'LIVE_SESSION_FORBIDDEN',
        'Only host agent can modify this live session.',
        403,
      );
    }
    if (session.status !== 'forming' && session.status !== 'live') {
      throw new ServiceError(
        'LIVE_SESSION_INVALID_STATE',
        'Only forming/live sessions can be completed.',
        409,
      );
    }
    const recapSummaryInput = input.recapSummary?.trim();
    const recapClipUrlInput = input.recapClipUrl?.trim();
    const autoRecap = this.buildAutoRecap(detailBefore);
    const recapSummary = recapSummaryInput || autoRecap.recapSummary;
    const recapClipUrl = recapClipUrlInput || autoRecap.recapClipUrl;

    await db.query(
      `UPDATE live_studio_sessions
       SET status = 'completed',
           recap_summary = $2,
           recap_clip_url = $3,
           ended_at = COALESCE(ended_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId, recapSummary, recapClipUrl],
    );

    return this.requireSessionDetail(sessionId, db);
  }

  async upsertPresence(
    sessionId: string,
    input: UpsertLivePresenceInput,
    client?: DbClient,
  ): Promise<LiveSessionPresence> {
    const db = getDb(this.pool, client);
    const session = await this.requireSession(sessionId, db);
    if (session.status === 'cancelled' || session.status === 'completed') {
      throw new ServiceError(
        'LIVE_SESSION_CLOSED',
        'Presence updates are disabled for closed sessions.',
        409,
      );
    }

    await this.ensureParticipantExists(
      input.participantType,
      input.participantId,
      db,
    );

    const upserted = await db.query(
      `INSERT INTO live_session_presence (
         session_id,
         participant_type,
         participant_id,
         status
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (session_id, participant_type, participant_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         last_seen_at = NOW()
       RETURNING *`,
      [sessionId, input.participantType, input.participantId, input.status],
    );

    await db.query(
      `UPDATE live_studio_sessions
       SET updated_at = NOW()
       WHERE id = $1`,
      [sessionId],
    );

    return mapPresence(upserted.rows[0] as LiveSessionPresenceRow);
  }

  async addMessage(
    sessionId: string,
    input: AddLiveMessageInput,
    client?: DbClient,
  ): Promise<LiveSessionMessage> {
    const db = getDb(this.pool, client);
    const session = await this.requireSession(sessionId, db);
    if (session.status !== 'forming' && session.status !== 'live') {
      throw new ServiceError(
        'LIVE_SESSION_CLOSED',
        'Messages are disabled for closed sessions.',
        409,
      );
    }

    await this.ensureParticipantExists(input.authorType, input.authorId, db);
    const content = input.content?.trim();
    if (!content) {
      throw new ServiceError(
        'LIVE_SESSION_INVALID_MESSAGE',
        'Message content is required.',
        400,
      );
    }
    if (content.length > 500) {
      throw new ServiceError(
        'LIVE_SESSION_INVALID_MESSAGE',
        'Message is too long (max 500 chars).',
        400,
      );
    }

    await this.upsertPresence(
      sessionId,
      {
        participantType: input.authorType,
        participantId: input.authorId,
        status: 'watching',
      },
      db,
    );

    const inserted = await db.query(
      `INSERT INTO live_session_messages (
         session_id,
         author_type,
         author_id,
         author_label,
         content
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, input.authorType, input.authorId, input.authorLabel, content],
    );

    await db.query(
      `UPDATE live_studio_sessions
       SET updated_at = NOW()
       WHERE id = $1`,
      [sessionId],
    );

    return mapMessage(inserted.rows[0] as LiveSessionMessageRow);
  }

  private async requireSession(
    sessionId: string,
    db: DbClient,
  ): Promise<LiveStudioSession> {
    const detail = await this.getSession(sessionId, db);
    if (!detail) {
      throw new ServiceError(
        'LIVE_SESSION_NOT_FOUND',
        'Live session not found.',
        404,
      );
    }
    return detail.session;
  }

  private async requireSessionDetail(
    sessionId: string,
    db: DbClient,
  ): Promise<LiveSessionDetail> {
    const detail = await this.getSession(sessionId, db);
    if (!detail) {
      throw new ServiceError(
        'LIVE_SESSION_NOT_FOUND',
        'Live session not found.',
        404,
      );
    }
    return detail;
  }

  private buildAutoRecap(detail: LiveSessionDetail): {
    recapSummary: string;
    recapClipUrl: string;
  } {
    const observerCount = detail.presence.filter(
      (presence) => presence.participantType === 'human',
    ).length;
    const agentCount = detail.presence.filter(
      (presence) => presence.participantType === 'agent',
    ).length;

    let mergeSignals = 0;
    let rejectSignals = 0;
    for (const message of detail.messages.slice(0, 20)) {
      const content = message.content.toLowerCase();
      if (
        content.includes('merge') ||
        content.includes('approve') ||
        content.includes('ship')
      ) {
        mergeSignals += 1;
      }
      if (
        content.includes('reject') ||
        content.includes('decline') ||
        content.includes('block')
      ) {
        rejectSignals += 1;
      }
    }

    const totalSignals = mergeSignals + rejectSignals;
    const mergeSignalPct =
      totalSignals > 0 ? Math.round((mergeSignals / totalSignals) * 100) : 0;
    const rejectSignalPct =
      totalSignals > 0 ? Math.round((rejectSignals / totalSignals) * 100) : 0;

    const highlights = detail.messages
      .slice(0, 3)
      .map((message) => {
        const text = message.content.trim();
        const clipped = text.length > 72 ? `${text.slice(0, 72)}…` : text;
        return `${message.authorLabel}: ${clipped}`;
      })
      .join(' | ');

    const summaryBase = `Auto recap: ${detail.session.title}. ${observerCount} observers, ${agentCount} agents, ${detail.session.messageCount} messages.`;
    const signalSummary =
      totalSignals > 0
        ? ` Crowd signal: ${mergeSignalPct}% merge / ${rejectSignalPct}% reject.`
        : ' Crowd signal: not enough prediction cues yet.';
    const highlightSummary =
      highlights.length > 0 ? ` Highlights: ${highlights}` : '';

    const clipSlug = detail.session.draftId
      ? `${detail.session.draftId}-${detail.session.id}`
      : detail.session.id;
    const recapClipUrl = `https://cdn.finishit.local/live-recaps/${clipSlug}.mp4`;

    return {
      recapSummary: `${summaryBase}${signalSummary}${highlightSummary}`,
      recapClipUrl,
    };
  }

  private async requireHostSession(
    sessionId: string,
    hostAgentId: string,
    db: DbClient,
  ): Promise<LiveStudioSession> {
    const session = await this.requireSession(sessionId, db);
    if (session.hostAgentId !== hostAgentId) {
      throw new ServiceError(
        'LIVE_SESSION_FORBIDDEN',
        'Only host agent can modify this live session.',
        403,
      );
    }
    return session;
  }

  private async ensureAgentExists(
    agentId: string,
    db: DbClient,
  ): Promise<void> {
    const result = await db.query('SELECT id FROM agents WHERE id = $1', [
      agentId,
    ]);
    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }
  }

  private async ensureHumanExists(
    humanId: string,
    db: DbClient,
  ): Promise<void> {
    const result = await db.query('SELECT id FROM users WHERE id = $1', [
      humanId,
    ]);
    if (result.rows.length === 0) {
      throw new ServiceError('USER_NOT_FOUND', 'User not found.', 404);
    }
  }

  private async ensureParticipantExists(
    participantType: 'human' | 'agent',
    participantId: string,
    db: DbClient,
  ): Promise<void> {
    if (participantType === 'agent') {
      await this.ensureAgentExists(participantId, db);
      return;
    }
    await this.ensureHumanExists(participantId, db);
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
}
