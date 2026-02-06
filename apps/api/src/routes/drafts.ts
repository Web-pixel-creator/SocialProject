import { type Request, Router } from 'express';
import { db } from '../db/pool';
import { logger } from '../logging/logger';
import {
  requireAgent,
  requireHuman,
  requireVerifiedAgent,
} from '../middleware/auth';
import { computeHeavyRateLimiter } from '../middleware/security';
import { BudgetServiceImpl } from '../services/budget/budgetService';
import { ServiceError } from '../services/common/errors';
import { FixRequestServiceImpl } from '../services/fixRequest/fixRequestService';
import { MetricsServiceImpl } from '../services/metrics/metricsService';
import { NotificationServiceImpl } from '../services/notification/notificationService';
import { DraftArcServiceImpl } from '../services/observer';
import { PostServiceImpl } from '../services/post/postService';
import { PullRequestServiceImpl } from '../services/pullRequest/pullRequestService';
import type { RealtimeService } from '../services/realtime/types';
import { SandboxServiceImpl } from '../services/sandbox/sandboxService';
import { EmbeddingServiceImpl } from '../services/search/embeddingService';
import { SearchServiceImpl } from '../services/search/searchService';

const router = Router();
const postService = new PostServiceImpl(db);
const fixService = new FixRequestServiceImpl(db);
const prService = new PullRequestServiceImpl(db);
const budgetService = new BudgetServiceImpl();
const sandboxService = new SandboxServiceImpl();
const metricsService = new MetricsServiceImpl(db);
const notificationService = new NotificationServiceImpl(db, async () =>
  Promise.resolve(),
);
const searchService = new SearchServiceImpl(db);
const embeddingService = new EmbeddingServiceImpl(db);
const draftArcService = new DraftArcServiceImpl(db);

const getRealtime = (req: Request): RealtimeService | undefined => {
  return req.app.get('realtime');
};

// We only need a "looks like UUID" guard to catch obvious mistakes like "undefined".
// Keep it permissive so test fixtures and non-v4 UUIDs still pass validation.
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

router.post(
  '/drafts',
  requireAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      const { imageUrl, thumbnailUrl, metadata } = req.body;
      const agentId = req.auth?.id as string;
      const trustResult = await db.query(
        'SELECT trust_tier FROM agents WHERE id = $1',
        [agentId],
      );
      const trustTier = Number(trustResult.rows[0]?.trust_tier ?? 0);
      const isSandbox = trustTier < 1;

      if (isSandbox) {
        await sandboxService.checkDraftLimit(agentId);
      }

      const result = await postService.createDraft({
        authorId: agentId,
        imageUrl,
        thumbnailUrl,
        metadata,
        isSandbox,
      });

      if (isSandbox) {
        await sandboxService.incrementDraftLimit(agentId);
      } else {
        try {
          const embedding = await embeddingService.generateEmbedding({
            draftId: result.draft.id,
            source: 'auto',
            imageUrl,
            metadata,
          });
          if (embedding && embedding.length > 0) {
            await searchService.upsertDraftEmbedding(
              result.draft.id,
              embedding,
              'auto',
            );
          }
        } catch (error) {
          logger.warn(
            { err: error, draftId: result.draft.id },
            'Draft embedding upsert failed',
          );
        }

        getRealtime(req)?.broadcast('feed:live', 'draft_created', {
          draftId: result.draft.id,
        });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/drafts', async (req, res, next) => {
  try {
    const { status, authorId, limit, offset } = req.query;
    const drafts = await postService.listDrafts({
      status: status as any,
      authorId: authorId as string,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json(drafts);
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const result = await postService.getDraftWithVersions(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:id/arc', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const arc = await draftArcService.getDraftArc(req.params.id);
    res.json(arc);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/drafts/:id/release',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const draft = await postService.getDraft(req.params.id);
      if (draft.authorId !== req.auth?.id) {
        return res.status(403).json({ error: 'NOT_AUTHOR' });
      }
      const result = await postService.releaseDraft(req.params.id);
      try {
        await draftArcService.recordDraftEvent(req.params.id, 'draft_released');
      } catch (error) {
        logger.warn(
          { err: error, draftId: req.params.id },
          'Observer arc update failed after release',
        );
      }
      getRealtime(req)?.broadcast(`post:${req.params.id}`, 'draft_released', {
        draftId: req.params.id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/drafts/:id/fix-requests',
  requireVerifiedAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      const draftId = req.params.id;
      const agentId = req.auth?.id as string;

      await budgetService.checkEditBudget(draftId, 'fix_request');
      await budgetService.checkActionBudget(agentId, 'fix_request');

      const fix = await fixService.submitFixRequest({
        draftId,
        criticId: agentId,
        category: req.body.category,
        description: req.body.description,
        coordinates: req.body.coordinates,
      });

      await budgetService.incrementEditBudget(draftId, 'fix_request');
      await budgetService.incrementActionBudget(agentId, 'fix_request');

      await notificationService.notifyAuthorOnFixRequest(draftId, fix.id);
      try {
        await draftArcService.recordDraftEvent(draftId, 'fix_request');
      } catch (error) {
        logger.warn(
          { err: error, draftId },
          'Observer arc update failed after fix request',
        );
      }
      getRealtime(req)?.broadcast(`post:${draftId}`, 'fix_request', {
        id: fix.id,
        draftId,
      });
      getRealtime(req)?.broadcast('feed:live', 'draft_activity', { draftId });

      res.json(fix);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/drafts/:id/fix-requests', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const list = await fixService.listByDraft(req.params.id);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/drafts/:id/pull-requests',
  requireVerifiedAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      const draftId = req.params.id;
      const agentId = req.auth?.id as string;
      const severity = req.body.severity as 'major' | 'minor';
      const budgetType = severity === 'major' ? 'major_pr' : 'pr';

      await budgetService.checkEditBudget(draftId, budgetType);
      await budgetService.checkActionBudget(agentId, budgetType);

      const pr = await prService.submitPullRequest({
        draftId,
        makerId: agentId,
        description: req.body.description,
        severity,
        addressedFixRequests: req.body.addressedFixRequests,
        imageUrl: req.body.imageUrl,
        thumbnailUrl: req.body.thumbnailUrl,
      });

      await budgetService.incrementEditBudget(draftId, budgetType);
      await budgetService.incrementActionBudget(agentId, budgetType);

      await notificationService.notifyAuthorOnPullRequest(draftId, pr.id);
      try {
        await draftArcService.recordDraftEvent(draftId, 'pull_request');
      } catch (error) {
        logger.warn(
          { err: error, draftId },
          'Observer arc update failed after pull request',
        );
      }
      getRealtime(req)?.broadcast(`post:${draftId}`, 'pull_request', {
        id: pr.id,
        draftId,
      });
      getRealtime(req)?.broadcast('feed:live', 'draft_activity', { draftId });

      res.json(pr);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/drafts/:id/embedding',
  requireVerifiedAgent,
  computeHeavyRateLimiter,
  async (req, res, next) => {
    try {
      const draftId = req.params.id;
      const embedding = req.body?.embedding as number[] | undefined;
      const source = req.body?.source as string | undefined;

      const draft = await postService.getDraft(draftId);
      if (draft.authorId !== req.auth?.id) {
        return res.status(403).json({ error: 'NOT_AUTHOR' });
      }

      await searchService.upsertDraftEmbedding(
        draftId,
        embedding ?? [],
        source,
      );
      res.json({ draftId, status: 'ok' });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/drafts/:id/pull-requests', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('DRAFT_ID_INVALID', 'Invalid draft id.', 400);
    }
    const list = await prService.listByDraft(req.params.id);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

router.get('/pull-requests/:id', async (req, res, next) => {
  try {
    const review = await prService.getReviewData(req.params.id);
    res.json(review);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/pull-requests/:id/predict',
  requireHuman,
  async (req, res, next) => {
    try {
      if (!isUuid(req.params.id)) {
        throw new ServiceError(
          'PR_ID_INVALID',
          'Invalid pull request id.',
          400,
        );
      }
      const predictedOutcome = req.body?.predictedOutcome ?? req.body?.outcome;
      if (predictedOutcome !== 'merge' && predictedOutcome !== 'reject') {
        throw new ServiceError(
          'PREDICTION_INVALID',
          'Prediction must be merge or reject.',
          400,
        );
      }
      const prediction = await draftArcService.submitPrediction(
        req.auth?.id as string,
        req.params.id,
        predictedOutcome,
      );
      res.json(prediction);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/pull-requests/:id/predictions',
  requireHuman,
  async (req, res, next) => {
    try {
      if (!isUuid(req.params.id)) {
        throw new ServiceError(
          'PR_ID_INVALID',
          'Invalid pull request id.',
          400,
        );
      }
      const summary = await draftArcService.getPredictionSummary(
        req.auth?.id as string,
        req.params.id,
      );
      res.json(summary);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pull-requests/:id/decide',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const decision = req.body.decision as
        | 'merge'
        | 'reject'
        | 'request_changes';
      const pr = await prService.decidePullRequest({
        pullRequestId: req.params.id,
        authorId: req.auth?.id as string,
        decision,
        feedback: req.body.feedback,
        rejectionReason: req.body.rejectionReason,
      });

      if (decision === 'merge') {
        await metricsService.updateImpactOnMerge(pr.makerId, pr.severity);
        await metricsService.updateSignalOnDecision(pr.makerId, 'merged');
        const glowUp = await metricsService.recalculateDraftGlowUp(pr.draftId);
        getRealtime(req)?.broadcast(`post:${pr.draftId}`, 'glowup_update', {
          draftId: pr.draftId,
          glowUp,
        });

        try {
          const embeddingResult = await db.query(
            `SELECT v.image_url, d.metadata
           FROM versions v
           JOIN drafts d ON v.draft_id = d.id
           WHERE v.pull_request_id = $1`,
            [pr.id],
          );
          const row = embeddingResult.rows[0];
          const embedding = await embeddingService.generateEmbedding({
            draftId: pr.draftId,
            source: 'auto',
            imageUrl: row?.image_url,
            metadata: row?.metadata,
          });
          if (embedding && embedding.length > 0) {
            await searchService.upsertDraftEmbedding(
              pr.draftId,
              embedding,
              'auto',
            );
          }
        } catch (error) {
          logger.warn(
            { err: error, draftId: pr.draftId, pullRequestId: pr.id },
            'Merge embedding upsert failed',
          );
        }
      }

      if (decision === 'reject') {
        await metricsService.updateSignalOnDecision(pr.makerId, 'rejected');
      }

      await notificationService.notifyMakerOnDecision(pr.id, decision);
      try {
        await draftArcService.recordDraftEvent(
          pr.draftId,
          'pull_request_decision',
        );
      } catch (error) {
        logger.warn(
          { err: error, draftId: pr.draftId, pullRequestId: pr.id },
          'Observer arc update failed after PR decision',
        );
      }
      getRealtime(req)?.broadcast(
        `post:${pr.draftId}`,
        'pull_request_decision',
        {
          id: pr.id,
          draftId: pr.draftId,
          decision,
        },
      );

      res.json(pr);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/pull-requests/:id/fork',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const fork = await prService.createForkFromRejected(
        req.params.id,
        req.auth?.id as string,
      );
      res.json(fork);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
