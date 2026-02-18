import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman } from '../middleware/auth';
import { CreatorStudioServiceImpl } from '../services/creatorStudio/creatorStudioService';
import type {
  CreateCreatorStudioInput,
  CreatorStudioStatus,
  UpdateCreatorGovernanceInput,
} from '../services/creatorStudio/types';

const router = Router();
const creatorStudioService = new CreatorStudioServiceImpl(db);

const STUDIO_STATUSES: CreatorStudioStatus[] = ['draft', 'active', 'paused'];

router.get(
  '/creator-studios/funnels/summary',
  requireHuman,
  async (req, res, next) => {
    try {
      const windowDays = req.query.windowDays
        ? Number(req.query.windowDays)
        : undefined;
      if (req.query.windowDays && Number.isNaN(windowDays)) {
        return res.status(400).json({ error: 'INVALID_WINDOW_DAYS' });
      }

      const ownerUserId = req.auth?.id as string;
      const summary = await creatorStudioService.getFunnelSummary(
        ownerUserId,
        windowDays,
      );
      res.json(summary);
    } catch (error) {
      next(error);
    }
  },
);

router.get('/creator-studios/mine', requireHuman, async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === 'string'
        ? (req.query.status as CreatorStudioStatus)
        : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    if (status && !STUDIO_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'INVALID_CREATOR_STUDIO_STATUS' });
    }
    if (req.query.limit && Number.isNaN(limit)) {
      return res.status(400).json({ error: 'INVALID_LIMIT' });
    }
    if (req.query.offset && Number.isNaN(offset)) {
      return res.status(400).json({ error: 'INVALID_OFFSET' });
    }

    const ownerUserId = req.auth?.id as string;
    const studios = await creatorStudioService.listStudios({
      status,
      limit,
      offset,
      ownerUserId,
    });
    res.json(studios);
  } catch (error) {
    next(error);
  }
});

router.get('/creator-studios', async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === 'string'
        ? (req.query.status as CreatorStudioStatus)
        : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    if (status && !STUDIO_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'INVALID_CREATOR_STUDIO_STATUS' });
    }
    if (req.query.limit && Number.isNaN(limit)) {
      return res.status(400).json({ error: 'INVALID_LIMIT' });
    }
    if (req.query.offset && Number.isNaN(offset)) {
      return res.status(400).json({ error: 'INVALID_OFFSET' });
    }

    const studios = await creatorStudioService.listStudios({
      status,
      limit,
      offset,
    });
    res.json(studios);
  } catch (error) {
    next(error);
  }
});

router.get('/creator-studios/:id', async (req, res, next) => {
  try {
    const studio = await creatorStudioService.getStudio(req.params.id);
    if (!studio) {
      return res.status(404).json({ error: 'CREATOR_STUDIO_NOT_FOUND' });
    }
    res.json(studio);
  } catch (error) {
    next(error);
  }
});

router.post('/creator-studios', requireHuman, async (req, res, next) => {
  try {
    const payload = req.body as CreateCreatorStudioInput;
    const studio = await creatorStudioService.createStudio(
      req.auth?.id as string,
      payload,
    );
    res.status(201).json(studio);
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/creator-studios/:id/governance',
  requireHuman,
  async (req, res, next) => {
    try {
      const payload = req.body as UpdateCreatorGovernanceInput;
      const studio = await creatorStudioService.updateGovernance(
        req.params.id,
        req.auth?.id as string,
        payload,
      );
      res.json(studio);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/creator-studios/:id/billing/connect',
  requireHuman,
  async (req, res, next) => {
    try {
      const providerAccountId =
        typeof req.body?.providerAccountId === 'string'
          ? req.body.providerAccountId
          : undefined;
      const studio = await creatorStudioService.connectBilling(
        req.params.id,
        req.auth?.id as string,
        providerAccountId,
      );
      res.json(studio);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/creator-studios/:id/retention/ping',
  requireHuman,
  async (req, res, next) => {
    try {
      const studio = await creatorStudioService.retentionPing(
        req.params.id,
        req.auth?.id as string,
      );
      res.json(studio);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
