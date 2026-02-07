import { type Request, Router } from 'express';
import { env } from '../config/env';
import { db } from '../db/pool';
import { logger } from '../logging/logger';
import { ServiceError } from '../services/common/errors';
import { FixRequestServiceImpl } from '../services/fixRequest/fixRequestService';
import { MetricsServiceImpl } from '../services/metrics/metricsService';
import { PostServiceImpl } from '../services/post/postService';
import { PullRequestServiceImpl } from '../services/pullRequest/pullRequestService';
import type { RealtimeService } from '../services/realtime/types';
import { EmbeddingServiceImpl } from '../services/search/embeddingService';
import { SearchServiceImpl } from '../services/search/searchService';

const router = Router();
const postService = new PostServiceImpl(db);
const fixService = new FixRequestServiceImpl(db);
const prService = new PullRequestServiceImpl(db);
const metricsService = new MetricsServiceImpl(db);
const embeddingService = new EmbeddingServiceImpl(db);
const searchService = new SearchServiceImpl(db);

const getRealtime = (req: Request): RealtimeService | undefined =>
  req.app.get('realtime');

const ensureDemoAgent = async (studioName: string, personality: string) => {
  const existing = await db.query(
    'SELECT id FROM agents WHERE studio_name = $1',
    [studioName],
  );
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id;
    await db.query(
      `UPDATE agents
       SET trust_tier = GREATEST(trust_tier, 1),
           trust_reason = COALESCE(trust_reason, 'demo')
       WHERE id = $1`,
      [id],
    );
    return { id };
  }

  const result = await db.query(
    `INSERT INTO agents (studio_name, personality, api_key_hash, trust_tier, trust_reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [studioName, personality, 'demo', 1, 'demo'],
  );
  return { id: result.rows[0].id };
};

router.post('/demo/flow', async (req, res, next) => {
  try {
    if (env.NODE_ENV === 'production' && env.ENABLE_DEMO_FLOW !== 'true') {
      return res
        .status(403)
        .json({ error: 'DEMO_DISABLED', message: 'Demo flow disabled.' });
    }

    const requestedDraftId = req.body?.draftId as string | undefined;
    let draftId = requestedDraftId;
    let authorId = '';

    if (draftId) {
      const draftResult = await db.query(
        'SELECT author_id, status FROM drafts WHERE id = $1',
        [draftId],
      );
      if (draftResult.rows.length === 0) {
        throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
      }
      if (draftResult.rows[0].status === 'release') {
        throw new ServiceError('DRAFT_RELEASED', 'Draft is released.', 400);
      }
      authorId = draftResult.rows[0].author_id;
    } else {
      const author = await ensureDemoAgent('Demo Studio Alpha', 'Demo author');
      authorId = author.id;
      const created = await postService.createDraft({
        authorId,
        imageUrl: 'https://placehold.co/1200x800/png?text=Demo+Draft',
        thumbnailUrl: 'https://placehold.co/400x300/png?text=Demo+Thumb',
        metadata: {
          title: 'Demo Landing',
          tags: ['demo', 'landing', 'studio'],
        },
        isSandbox: false,
      });
      draftId = created.draft.id;
    }

    if (!draftId) {
      throw new ServiceError(
        'DEMO_FAILED',
        'Unable to resolve draft for demo flow.',
        500,
      );
    }

    const maker = await ensureDemoAgent('Demo Studio Beta', 'Demo maker');

    const fixRequest = await fixService.submitFixRequest({
      draftId,
      criticId: maker.id,
      category: 'Composition',
      description:
        'Align the hero hierarchy and increase contrast on primary CTA.',
      coordinates: { x: 0.12, y: 0.18, width: 0.4, height: 0.2 },
    });

    const pullRequest = await prService.submitPullRequest({
      draftId,
      makerId: maker.id,
      description:
        'Refined hero layout, updated typography scale, and improved CTA contrast.',
      severity: 'minor',
      addressedFixRequests: [fixRequest.id],
      imageUrl: 'https://placehold.co/1200x800/png?text=Demo+PR+v2',
      thumbnailUrl: 'https://placehold.co/400x300/png?text=Demo+PR+Thumb',
    });

    const merged = await prService.decidePullRequest({
      pullRequestId: pullRequest.id,
      authorId,
      decision: 'merge',
      feedback: 'Looks good.',
    });

    await metricsService.updateImpactOnMerge(
      pullRequest.makerId,
      pullRequest.severity,
    );
    await metricsService.updateSignalOnDecision(pullRequest.makerId, 'merged');
    const glowUp = await metricsService.recalculateDraftGlowUp(
      pullRequest.draftId,
    );

    try {
      const draftMeta = await db.query(
        'SELECT metadata FROM drafts WHERE id = $1',
        [draftId],
      );
      const embedding = await embeddingService.generateEmbedding({
        draftId,
        source: 'demo',
        imageUrl: 'https://placehold.co/1200x800/png?text=Demo+PR+v2',
        metadata: draftMeta.rows[0]?.metadata ?? {},
      });
      if (embedding && embedding.length > 0) {
        await searchService.upsertDraftEmbedding(draftId, embedding, 'demo');
      }
    } catch (error) {
      logger.warn({ err: error, draftId }, 'Demo embedding upsert failed');
    }

    const realtime = getRealtime(req);
    realtime?.broadcast(`post:${draftId}`, 'fix_request', {
      id: fixRequest.id,
      draftId,
    });
    realtime?.broadcast(`post:${draftId}`, 'pull_request', {
      id: pullRequest.id,
      draftId,
    });
    realtime?.broadcast(`post:${draftId}`, 'pull_request_decision', {
      id: pullRequest.id,
      draftId,
      decision: merged.status,
    });
    realtime?.broadcast(`post:${draftId}`, 'glowup_update', {
      draftId,
      glowUp,
    });

    res.json({
      draftId,
      fixRequestId: fixRequest.id,
      pullRequestId: pullRequest.id,
      glowUp,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
