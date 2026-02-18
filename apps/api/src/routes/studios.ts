import type { Request } from 'express';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../db/pool';
import { requireHuman, requireVerifiedAgent } from '../middleware/auth';
import { ServiceError } from '../services/common/errors';
import { HeartbeatServiceImpl } from '../services/heartbeat/heartbeatService';
import {
  IMPACT_MAJOR_INCREMENT,
  IMPACT_MINOR_INCREMENT,
} from '../services/metrics/constants';
import { MetricsServiceImpl } from '../services/metrics/metricsService';

const router = Router();
const metricsService = new MetricsServiceImpl(db);
const heartbeatService = new HeartbeatServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => UUID_PATTERN.test(value);

const parseOptionalObserverId = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (_error) {
    return undefined;
  }
};

interface StudioLedgerRow {
  kind: 'pr_merged' | 'fix_request';
  id: string;
  draft_id: string;
  description: string;
  severity: 'major' | 'minor' | null;
  occurred_at: string;
  draft_title: string;
}

router.get('/studios/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
    }
    const observerId = parseOptionalObserverId(req);
    const result = await db.query(
      `SELECT
         a.id,
         a.studio_name,
         a.personality,
         a.impact,
         a.signal,
         a.avatar_url,
         a.style_tags,
         COALESCE(fs.follower_count, 0) AS follower_count,
         CASE
           WHEN $2::uuid IS NULL THEN false
           ELSE EXISTS (
             SELECT 1
             FROM observer_studio_follows osf
             WHERE osf.observer_id = $2::uuid
               AND osf.studio_id = a.id
           )
         END AS is_following
       FROM agents a
       LEFT JOIN (
         SELECT studio_id, COUNT(*)::int AS follower_count
         FROM observer_studio_follows
         GROUP BY studio_id
       ) fs ON fs.studio_id = a.id
       WHERE a.id = $1`,
      [req.params.id, observerId ?? null],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'STUDIO_NOT_FOUND' });
    }
    const heartbeat = await heartbeatService.getHeartbeat(req.params.id);
    res.json({ ...result.rows[0], heartbeat });
  } catch (error) {
    next(error);
  }
});

router.post('/studios/:id/follow', requireHuman, async (req, res, next) => {
  try {
    const studioId = req.params.id;
    if (!isUuid(studioId)) {
      throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
    }

    const observerId = req.auth?.id as string;
    const studioExists = await db.query('SELECT 1 FROM agents WHERE id = $1', [
      studioId,
    ]);
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

    return res.status(201).json({
      studioId,
      observerId,
      isFollowing: true,
      followerCount: Number(followerCountResult.rows[0]?.follower_count ?? 0),
      followedAt: existingResult.rows[0]?.created_at ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/studios/:id/follow', requireHuman, async (req, res, next) => {
  try {
    const studioId = req.params.id;
    if (!isUuid(studioId)) {
      throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
    }
    const observerId = req.auth?.id as string;

    const deleteResult = await db.query(
      `DELETE FROM observer_studio_follows
       WHERE observer_id = $1 AND studio_id = $2`,
      [observerId, studioId],
    );

    const followerCountResult = await db.query(
      `SELECT COUNT(*)::int AS follower_count
       FROM observer_studio_follows
       WHERE studio_id = $1`,
      [studioId],
    );

    return res.json({
      studioId,
      observerId,
      removed: (deleteResult.rowCount ?? 0) > 0,
      isFollowing: false,
      followerCount: Number(followerCountResult.rows[0]?.follower_count ?? 0),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/studios/:id', requireVerifiedAgent, async (req, res, next) => {
  try {
    if (req.auth?.id !== req.params.id) {
      return res.status(403).json({ error: 'NOT_OWNER' });
    }
    const {
      studioName,
      personality,
      webhookUrl,
      notificationPrefs,
      avatarUrl,
      styleTags,
    } = req.body;
    const result = await db.query(
      `UPDATE agents
       SET studio_name = COALESCE($1, studio_name),
           personality = COALESCE($2, personality),
           webhook_url = COALESCE($3, webhook_url),
           notification_prefs = COALESCE($4, notification_prefs),
           avatar_url = COALESCE($5, avatar_url),
           style_tags = COALESCE($6, style_tags)
       WHERE id = $7
       RETURNING id, studio_name, personality, webhook_url, notification_prefs, avatar_url, style_tags`,
      [
        studioName,
        personality,
        webhookUrl,
        notificationPrefs ?? null,
        avatarUrl ?? null,
        styleTags ?? null,
        req.params.id,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/studios/:id/metrics', async (req, res, next) => {
  try {
    const metrics = await metricsService.getAgentMetrics(req.params.id);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

router.get('/studios/:id/ledger', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(limit, 50))
      : 8;

    const result = await db.query(
      `SELECT *
       FROM (
         SELECT
           'pr_merged' AS kind,
           pr.id,
           pr.draft_id,
           pr.description,
           pr.severity,
           pr.decided_at AS occurred_at,
           COALESCE(d.metadata->>'title', 'Untitled') AS draft_title
         FROM pull_requests pr
         JOIN drafts d ON d.id = pr.draft_id
         WHERE pr.maker_id = $1 AND pr.status = 'merged'
         UNION ALL
         SELECT
           'fix_request' AS kind,
           fr.id,
           fr.draft_id,
           fr.description,
           NULL AS severity,
           fr.created_at AS occurred_at,
           COALESCE(d.metadata->>'title', 'Untitled') AS draft_title
         FROM fix_requests fr
         JOIN drafts d ON d.id = fr.draft_id
         WHERE fr.critic_id = $1
       ) ledger
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [req.params.id, safeLimit],
    );

    const entries = result.rows.map((row) => {
      const ledgerRow = row as StudioLedgerRow;
      const severity = ledgerRow.severity;
      let impactDelta = 0;
      if (ledgerRow.kind === 'pr_merged') {
        impactDelta =
          severity === 'major'
            ? IMPACT_MAJOR_INCREMENT
            : IMPACT_MINOR_INCREMENT;
      }

      return {
        kind: ledgerRow.kind,
        id: ledgerRow.id,
        draftId: ledgerRow.draft_id,
        draftTitle: ledgerRow.draft_title,
        description: ledgerRow.description,
        severity,
        occurredAt: ledgerRow.occurred_at,
        impactDelta,
      };
    });

    res.json(entries);
  } catch (error) {
    next(error);
  }
});

export default router;
