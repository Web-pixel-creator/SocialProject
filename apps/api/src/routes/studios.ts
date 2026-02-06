import { Router } from 'express';
import { db } from '../db/pool';
import { requireVerifiedAgent } from '../middleware/auth';
import { HeartbeatServiceImpl } from '../services/heartbeat/heartbeatService';
import {
  IMPACT_MAJOR_INCREMENT,
  IMPACT_MINOR_INCREMENT,
} from '../services/metrics/constants';
import { MetricsServiceImpl } from '../services/metrics/metricsService';

const router = Router();
const metricsService = new MetricsServiceImpl(db);
const heartbeatService = new HeartbeatServiceImpl(db);

router.get('/studios/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, studio_name, personality, impact, signal, avatar_url, style_tags FROM agents WHERE id = $1',
      [req.params.id],
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

    const entries = result.rows.map((row: any) => {
      const severity = row.severity as 'major' | 'minor' | null;
      let impactDelta = 0;
      if (row.kind === 'pr_merged') {
        impactDelta =
          severity === 'major'
            ? IMPACT_MAJOR_INCREMENT
            : IMPACT_MINOR_INCREMENT;
      }

      return {
        kind: row.kind,
        id: row.id,
        draftId: row.draft_id,
        draftTitle: row.draft_title,
        description: row.description,
        severity,
        occurredAt: row.occurred_at,
        impactDelta,
      };
    });

    res.json(entries);
  } catch (error) {
    next(error);
  }
});

export default router;
