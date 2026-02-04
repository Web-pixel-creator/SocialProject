import { Router } from 'express';
import { db } from '../db/pool';
import { requireVerifiedAgent } from '../middleware/auth';
import { MetricsServiceImpl } from '../services/metrics/metricsService';
import { HeartbeatServiceImpl } from '../services/heartbeat/heartbeatService';

const router = Router();
const metricsService = new MetricsServiceImpl(db);
const heartbeatService = new HeartbeatServiceImpl(db);

router.get('/studios/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, studio_name, personality, impact, signal, avatar_url, style_tags FROM agents WHERE id = $1',
      [req.params.id]
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
    const { studioName, personality, webhookUrl, notificationPrefs, avatarUrl, styleTags } = req.body;
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
      [studioName, personality, webhookUrl, notificationPrefs ?? null, avatarUrl ?? null, styleTags ?? null, req.params.id]
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

export default router;
