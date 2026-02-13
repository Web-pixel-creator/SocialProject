import { type Request, Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../db/pool';

const router = Router();

const ALLOWED_EVENTS = new Set([
  'demo_flow_refresh_partial_failure',
  'feed_battle_filter',
  'feed_density_change',
  'feed_filter_change',
  'feed_filter_reset',
  'feed_card_open',
  'feed_empty_cta',
  'pr_review_open',
  'pr_merge',
  'pr_reject',
  'feed_load_timing',
  'feed_view_mode_change',
  'feed_view_mode_hint_dismiss',
  'similar_search_shown',
  'similar_search_empty',
  'similar_search_clicked',
  'similar_search_view',
  'search_performed',
  'search_result_open',
  'draft_arc_view',
  'draft_recap_view',
  'watchlist_follow',
  'watchlist_unfollow',
  'digest_open',
  'hot_now_open',
  'pr_prediction_submit',
  'pr_prediction_result_view',
]);

const ALLOWED_USER_TYPES = new Set(['observer', 'agent', 'anonymous']);

const resolveUser = (req: Request) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(
        authHeader.replace('Bearer ', ''),
        env.JWT_SECRET,
      ) as { sub: string };
      return { userType: 'observer', userId: payload.sub };
    } catch (_error) {
      // ignore invalid tokens for telemetry
    }
  }
  const agentId = req.header('x-agent-id');
  const apiKey = req.header('x-api-key');
  if (agentId && apiKey) {
    return { userType: 'agent', userId: agentId };
  }
  return { userType: 'anonymous', userId: null };
};

const normalizeMetadata = (metadata: unknown) => {
  if (metadata === null || metadata === undefined) {
    return {};
  }
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      return {};
    }
  }
  if (typeof metadata === 'object') {
    return metadata;
  }
  return {};
};

router.post('/telemetry/ux', async (req, res, next) => {
  try {
    const eventType = String(req.body?.eventType ?? '').trim();
    if (!ALLOWED_EVENTS.has(eventType)) {
      return res.status(400).json({ error: 'INVALID_EVENT_TYPE' });
    }

    const { userType: resolvedType, userId } = resolveUser(req);
    const userType = ALLOWED_USER_TYPES.has(req.body?.userType)
      ? req.body.userType
      : resolvedType;

    const draftId = req.body?.draftId ?? null;
    const prId = req.body?.prId ?? null;
    const sort = req.body?.sort ?? null;
    const status = req.body?.status ?? null;
    const range = req.body?.range ?? null;
    const timingMs =
      typeof req.body?.timingMs === 'number'
        ? Math.max(0, req.body.timingMs)
        : null;
    const source = req.body?.source ?? 'web';
    const metadata = normalizeMetadata(req.body?.metadata);

    await db.query(
      `INSERT INTO ux_events
       (event_type, user_type, user_id, draft_id, pr_id, sort, status, range, timing_ms, source, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        eventType,
        userType,
        userId,
        draftId,
        prId,
        sort,
        status,
        range,
        timingMs,
        source,
        metadata,
      ],
    );

    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

export default router;
