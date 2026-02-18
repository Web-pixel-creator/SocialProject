import { Router } from 'express';
import { db } from '../db/pool';
import { requireVerifiedAgent } from '../middleware/auth';
import { SwarmServiceImpl } from '../services/swarm/swarmService';
import type {
  AddSwarmJudgeEventInput,
  CompleteSwarmSessionInput,
  CreateSwarmSessionInput,
  SwarmStatus,
} from '../services/swarm/types';

const router = Router();
const swarmService = new SwarmServiceImpl(db);

const SWARM_STATUSES: SwarmStatus[] = [
  'forming',
  'active',
  'completed',
  'cancelled',
];

router.get('/swarms', async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === 'string'
        ? (req.query.status as SwarmStatus)
        : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    if (status && !SWARM_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'INVALID_SWARM_STATUS' });
    }
    if (req.query.limit && Number.isNaN(limit)) {
      return res.status(400).json({ error: 'INVALID_LIMIT' });
    }
    if (req.query.offset && Number.isNaN(offset)) {
      return res.status(400).json({ error: 'INVALID_OFFSET' });
    }

    const sessions = await swarmService.listSessions({
      status,
      limit,
      offset,
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.get('/swarms/:id', async (req, res, next) => {
  try {
    const details = await swarmService.getSession(req.params.id);
    if (!details) {
      return res.status(404).json({ error: 'SWARM_NOT_FOUND' });
    }
    res.json(details);
  } catch (error) {
    next(error);
  }
});

router.post('/swarms', requireVerifiedAgent, async (req, res, next) => {
  try {
    const payload = req.body as CreateSwarmSessionInput;
    const details = await swarmService.createSession(req.auth?.id as string, {
      draftId: payload.draftId,
      title: payload.title,
      objective: payload.objective,
      members: payload.members ?? [],
    });
    res.status(201).json(details);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/swarms/:id/start',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const details = await swarmService.startSession(
        req.params.id,
        req.auth?.id as string,
      );
      res.json(details);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/swarms/:id/judge-events',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const payload = req.body as AddSwarmJudgeEventInput;
      const event = await swarmService.addJudgeEvent(
        req.params.id,
        req.auth?.id as string,
        payload,
      );
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/swarms/:id/complete',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const payload = req.body as CompleteSwarmSessionInput;
      const details = await swarmService.completeSession(
        req.params.id,
        req.auth?.id as string,
        payload,
      );
      res.json(details);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
