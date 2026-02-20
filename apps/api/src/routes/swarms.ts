import { Router } from 'express';
import { db } from '../db/pool';
import { requireVerifiedAgent } from '../middleware/auth';
import { agentGatewayService } from '../services/agentGateway/agentGatewayService';
import { SwarmServiceImpl } from '../services/swarm/swarmService';
import type {
  AddSwarmJudgeEventInput,
  CompleteSwarmSessionInput,
  CreateSwarmSessionInput,
  SwarmRole,
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

const mapSwarmRoleToGatewayRole = (role: SwarmRole): string => {
  if (role === 'critic') {
    return 'critic';
  }
  if (role === 'strategist') {
    return 'judge';
  }
  return 'maker';
};

const inferGatewayRoles = (memberRoles: SwarmRole[]) => {
  const resolvedRoles = memberRoles.map((role) =>
    mapSwarmRoleToGatewayRole(role),
  );
  return Array.from(new Set(['author', ...resolvedRoles]));
};

const recordSwarmGatewayEvent = (params: {
  sessionId: string;
  draftId?: string | null;
  hostAgentId: string;
  eventType: string;
  fromRole: string;
  payload?: Record<string, unknown>;
  roles?: string[];
}) => {
  try {
    const gatewaySession = agentGatewayService.ensureExternalSession({
      channel: 'swarm',
      externalSessionId: params.sessionId,
      draftId: params.draftId,
      roles: params.roles,
      metadata: {
        hostAgentId: params.hostAgentId,
        source: 'swarm',
      },
    });
    agentGatewayService.appendEvent(gatewaySession.id, {
      fromRole: params.fromRole,
      type: params.eventType,
      payload: params.payload ?? {},
    });
  } catch (error) {
    console.error('swarm gateway event failed', error);
  }
};

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
    const memberRoles = details.members.map((member) => member.role);
    recordSwarmGatewayEvent({
      sessionId: details.session.id,
      draftId: details.session.draftId,
      hostAgentId: req.auth?.id as string,
      eventType: 'swarm_session_created',
      fromRole: 'author',
      roles: inferGatewayRoles(memberRoles),
      payload: {
        status: details.session.status,
        title: details.session.title,
        objective: details.session.objective,
        memberCount: details.session.memberCount,
      },
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
      const memberRoles = details.members.map((member) => member.role);
      recordSwarmGatewayEvent({
        sessionId: details.session.id,
        draftId: details.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'swarm_session_started',
        fromRole: 'judge',
        roles: inferGatewayRoles(memberRoles),
        payload: {
          status: details.session.status,
          startedAt: details.session.startedAt,
          memberCount: details.session.memberCount,
        },
      });
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
      recordSwarmGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: `swarm_judge_${event.eventType}`,
        fromRole: 'judge',
        payload: {
          judgeEventId: event.id,
          score: event.score,
          notes: event.notes,
        },
      });
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
      recordSwarmGatewayEvent({
        sessionId: details.session.id,
        draftId: details.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'swarm_session_completed',
        fromRole: 'judge',
        payload: {
          status: details.session.status,
          endedAt: details.session.endedAt,
          judgeScore: details.session.judgeScore,
        },
      });
      try {
        const gatewaySession = agentGatewayService.ensureExternalSession({
          channel: 'swarm',
          externalSessionId: details.session.id,
          draftId: details.session.draftId,
          metadata: { source: 'swarm', hostAgentId: req.auth?.id as string },
        });
        agentGatewayService.closeSession(gatewaySession.id);
      } catch (error) {
        console.error('swarm gateway close failed', error);
      }
      res.json(details);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
