import type { Request } from 'express';
import { Router } from 'express';
import { env } from '../config/env';
import { db } from '../db/pool';
import { requireAdmin } from '../middleware/admin';
import { redis } from '../redis/client';
import { agentGatewayService } from '../services/agentGateway/agentGatewayService';
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const toNumber = (value: string | number | undefined, fallback = 0) =>
  typeof value === 'number'
    ? value
    : Number.parseInt(value ?? `${fallback}`, 10);
const toRate = (numerator: number, denominator: number) =>
  denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;

const RUNTIME_ROLES: AIRuntimeRole[] = ['author', 'critic', 'maker', 'judge'];

const parseOptionalPositiveNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
};

const getRealtime = (req: Request) =>
  req.app.get('realtime') as RealtimeService | undefined;

const parseOptionalStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string');
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
      const batchSize = clamp(
        Number(req.body?.batchSize ?? req.query.batchSize ?? 200),
        1,
        1000,
      );
      const maxBatches = clamp(
        Number(req.body?.maxBatches ?? req.query.maxBatches ?? 1),
        1,
        20,
      );

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
      const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
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

router.get('/admin/ai-runtime/profiles', requireAdmin, (_req, res) => {
  res.json({
    profiles: aiRuntimeService.getProfiles(),
    providers: aiRuntimeService.getProviderStates(),
  });
});

router.post(
  '/admin/ai-runtime/dry-run',
  requireAdmin,
  async (req, res, next) => {
    try {
      const body =
        typeof req.body === 'object' && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {};
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
      if (typeof promptRaw !== 'string' || promptRaw.trim().length === 0) {
        throw new ServiceError(
          'AI_RUNTIME_INVALID_PROMPT',
          'prompt is required.',
          400,
        );
      }

      const providersOverride = Array.isArray(providersOverrideRaw)
        ? providersOverrideRaw
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : undefined;
      const simulateFailures = Array.isArray(simulateFailuresRaw)
        ? simulateFailuresRaw
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : undefined;
      const timeoutMs = parseOptionalPositiveNumber(timeoutMsRaw);

      const result = await aiRuntimeService.runWithFailover({
        role: roleRaw as AIRuntimeRole,
        prompt: promptRaw,
        timeoutMs,
        providersOverride,
        simulateFailures,
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

      const body =
        typeof req.body === 'object' && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {};
      const draftId = typeof body.draftId === 'string' ? body.draftId : '';
      const channel =
        typeof body.channel === 'string' ? body.channel : undefined;
      const externalSessionId =
        typeof body.externalSessionId === 'string'
          ? body.externalSessionId
          : undefined;
      const promptSeed =
        typeof body.promptSeed === 'string' ? body.promptSeed : undefined;
      const hostAgentId =
        typeof body.hostAgentId === 'string' ? body.hostAgentId : undefined;
      const metadata =
        body.metadata && typeof body.metadata === 'object'
          ? (body.metadata as Record<string, unknown>)
          : undefined;

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
      const limit = parseOptionalPositiveNumber(req.query.limit);
      const source = req.query.source === 'memory' ? 'memory' : 'db';
      const sessions =
        source === 'memory'
          ? agentGatewayService.listSessions(limit)
          : await agentGatewayService.listPersistedSessions(limit);
      res.json({ source, sessions });
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
      const body =
        typeof req.body === 'object' && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {};
      const channel = typeof body.channel === 'string' ? body.channel : '';
      const draftId =
        typeof body.draftId === 'string' && body.draftId.trim().length > 0
          ? body.draftId
          : null;
      const roles = parseOptionalStringArray(body.roles);
      const metadata =
        body.metadata && typeof body.metadata === 'object'
          ? (body.metadata as Record<string, unknown>)
          : undefined;

      const session = agentGatewayService.createSession({
        channel,
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
      const source = req.query.source === 'memory' ? 'memory' : 'db';
      const detail =
        source === 'memory'
          ? agentGatewayService.getSession(req.params.sessionId)
          : await agentGatewayService.getPersistedSession(req.params.sessionId);
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

router.post(
  '/admin/agent-gateway/sessions/:sessionId/events',
  requireAdmin,
  async (req, res, next) => {
    try {
      const body =
        typeof req.body === 'object' && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {};
      const fromRole = typeof body.fromRole === 'string' ? body.fromRole : '';
      const eventType = typeof body.type === 'string' ? body.type : '';
      const toRole =
        typeof body.toRole === 'string' && body.toRole.trim().length > 0
          ? body.toRole
          : undefined;
      const payload =
        body.payload && typeof body.payload === 'object'
          ? (body.payload as Record<string, unknown>)
          : undefined;

      const event = agentGatewayService.appendEvent(req.params.sessionId, {
        fromRole,
        toRole,
        type: eventType,
        payload,
      });
      await agentGatewayService.persistEvent(event);
      const detail = agentGatewayService.getSession(req.params.sessionId);
      await agentGatewayService.persistSession(detail.session);

      getRealtime(req)?.broadcast(
        `session:${req.params.sessionId}`,
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
  '/admin/agent-gateway/sessions/:sessionId/close',
  requireAdmin,
  async (req, res, next) => {
    try {
      const session = agentGatewayService.closeSession(req.params.sessionId);
      await agentGatewayService.persistSession(session);

      getRealtime(req)?.broadcast(
        `session:${req.params.sessionId}`,
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
    const agentId = req.query.agentId ? String(req.query.agentId) : null;
    const draftId = req.query.draftId ? String(req.query.draftId) : null;
    const date = parseDateParam(
      req.query.date ? String(req.query.date) : undefined,
    );
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
    const date = parseDateParam(
      req.query.date ? String(req.query.date) : undefined,
    );
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

router.get('/admin/system/metrics', requireAdmin, async (_req, res, next) => {
  try {
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
    const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
    const eventType = req.query.eventType ? String(req.query.eventType) : null;
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
    const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
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

    res.json({ windowHours: hours, rows: summary.rows, profiles });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/admin/ux/observer-engagement',
  requireAdmin,
  async (req, res, next) => {
    try {
      const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
      const trackedEvents = [
        'draft_arc_view',
        'draft_recap_view',
        'watchlist_follow',
        'watchlist_unfollow',
        'digest_open',
        'hot_now_open',
        'pr_prediction_submit',
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
        predictionResultViews: 0,
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
          case 'pr_prediction_result_view':
            totals.predictionResultViews += count;
            break;
          default:
            break;
        }
      }

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
          predictionPoolPoints: predictionStakePoints,
          payoutToStakeRatio,
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

router.get('/admin/cleanup/preview', requireAdmin, async (_req, res, next) => {
  try {
    const counts = await privacyService.previewExpiredData();
    res.json({ counts });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/cleanup/run', requireAdmin, async (req, res, next) => {
  const confirm = req.body?.confirm ?? req.query.confirm;
  if (confirm !== true && confirm !== 'true') {
    return next(
      new ServiceError(
        'CONFIRM_REQUIRED',
        'confirm=true is required to run cleanup.',
        400,
      ),
    );
  }

  const startedAt = new Date();
  try {
    const counts = await privacyService.purgeExpiredData();
    await recordCleanupRun('manual_cleanup', 'success', startedAt, counts);
    res.json({ counts });
  } catch (error) {
    await recordCleanupRun(
      'manual_cleanup',
      'failed',
      startedAt,
      undefined,
      error instanceof Error ? error.message : String(error),
    );
    next(error);
  }
});

router.get('/admin/jobs/metrics', requireAdmin, async (req, res, next) => {
  try {
    const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
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
    const hours = clamp(Number(req.query.hours ?? 24), 1, 720);
    const limit = clamp(Number(req.query.limit ?? 50), 1, 200);
    const errorCode = req.query.code ? String(req.query.code) : null;
    const route = req.query.route ? String(req.query.route) : null;

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
