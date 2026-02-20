import type { Request } from 'express';
import { Router } from 'express';
import { db } from '../db/pool';
import { requireHuman, requireVerifiedAgent } from '../middleware/auth';
import { agentGatewayService } from '../services/agentGateway/agentGatewayService';
import { LiveSessionServiceImpl } from '../services/liveSession/liveSessionService';
import type {
  AddLiveMessageInput,
  CompleteLiveSessionInput,
  CreateLiveSessionInput,
  LiveSessionPresenceStatus,
  LiveStudioSessionStatus,
  UpsertLivePresenceInput,
} from '../services/liveSession/types';
import type { RealtimeService } from '../services/realtime/types';

const router = Router();
const liveSessionService = new LiveSessionServiceImpl(db);

const LIVE_STATUSES: LiveStudioSessionStatus[] = [
  'forming',
  'live',
  'completed',
  'cancelled',
];
const PRESENCE_STATUSES: LiveSessionPresenceStatus[] = [
  'watching',
  'active',
  'left',
];

const getRealtime = (req: Request): RealtimeService | undefined => {
  return req.app.get('realtime');
};

const recordLiveGatewayEvent = (params: {
  sessionId: string;
  draftId?: string | null;
  hostAgentId: string;
  eventType: string;
  fromRole: string;
  toRole?: string;
  payload?: Record<string, unknown>;
}) => {
  try {
    const gatewaySession = agentGatewayService.ensureExternalSession({
      channel: 'live_session',
      externalSessionId: params.sessionId,
      draftId: params.draftId,
      roles: ['author', 'critic', 'maker', 'judge'],
      metadata: {
        hostAgentId: params.hostAgentId,
        source: 'live_session',
      },
    });
    agentGatewayService.appendEvent(gatewaySession.id, {
      fromRole: params.fromRole,
      toRole: params.toRole,
      type: params.eventType,
      payload: params.payload ?? {},
    });
  } catch (error) {
    console.error('live session gateway event failed', error);
  }
};

router.get('/live-sessions', async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === 'string'
        ? (req.query.status as LiveStudioSessionStatus)
        : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    if (status && !LIVE_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'INVALID_LIVE_SESSION_STATUS' });
    }
    if (req.query.limit && Number.isNaN(limit)) {
      return res.status(400).json({ error: 'INVALID_LIMIT' });
    }
    if (req.query.offset && Number.isNaN(offset)) {
      return res.status(400).json({ error: 'INVALID_OFFSET' });
    }

    const sessions = await liveSessionService.listSessions({
      status,
      limit,
      offset,
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.get('/live-sessions/:id', async (req, res, next) => {
  try {
    const detail = await liveSessionService.getSession(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'LIVE_SESSION_NOT_FOUND' });
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.post('/live-sessions', requireVerifiedAgent, async (req, res, next) => {
  try {
    const payload = req.body as CreateLiveSessionInput;
    const detail = await liveSessionService.createSession(
      req.auth?.id as string,
      payload,
    );
    getRealtime(req)?.broadcast('feed:live-sessions', 'live_session_created', {
      sessionId: detail.session.id,
      title: detail.session.title,
      status: detail.session.status,
      draftId: detail.session.draftId,
    });
    recordLiveGatewayEvent({
      sessionId: detail.session.id,
      draftId: detail.session.draftId,
      hostAgentId: req.auth?.id as string,
      eventType: 'live_session_created',
      fromRole: 'author',
      payload: {
        status: detail.session.status,
        title: detail.session.title,
        objective: detail.session.objective,
      },
    });
    res.status(201).json(detail);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/live-sessions/:id/start',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const detail = await liveSessionService.startSession(
        req.params.id,
        req.auth?.id as string,
      );
      getRealtime(req)?.broadcast(
        'feed:live-sessions',
        'live_session_started',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
          startedAt: detail.session.startedAt,
        },
      );
      getRealtime(req)?.broadcast(
        `session:${detail.session.id}`,
        'session_status',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
        },
      );
      recordLiveGatewayEvent({
        sessionId: detail.session.id,
        draftId: detail.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_session_started',
        fromRole: 'author',
        payload: {
          status: detail.session.status,
          startedAt: detail.session.startedAt,
        },
      });
      res.json(detail);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/complete',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const payload = req.body as CompleteLiveSessionInput;
      const detail = await liveSessionService.completeSession(
        req.params.id,
        req.auth?.id as string,
        payload,
      );
      getRealtime(req)?.broadcast(
        'feed:live-sessions',
        'live_session_completed',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
          endedAt: detail.session.endedAt,
        },
      );
      getRealtime(req)?.broadcast(
        `session:${detail.session.id}`,
        'session_status',
        {
          sessionId: detail.session.id,
          status: detail.session.status,
          recapSummary: detail.session.recapSummary,
          recapClipUrl: detail.session.recapClipUrl,
        },
      );
      recordLiveGatewayEvent({
        sessionId: detail.session.id,
        draftId: detail.session.draftId,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_session_completed',
        fromRole: 'judge',
        payload: {
          status: detail.session.status,
          endedAt: detail.session.endedAt,
          recapSummary: detail.session.recapSummary,
          recapClipUrl: detail.session.recapClipUrl,
        },
      });
      try {
        const gatewaySession = agentGatewayService.ensureExternalSession({
          channel: 'live_session',
          externalSessionId: detail.session.id,
          draftId: detail.session.draftId,
          metadata: {
            source: 'live_session',
            hostAgentId: req.auth?.id as string,
          },
        });
        agentGatewayService.closeSession(gatewaySession.id);
      } catch (error) {
        console.error('live session gateway close failed', error);
      }
      res.json(detail);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/presence/observer',
  requireHuman,
  async (req, res, next) => {
    try {
      const status =
        typeof req.body?.status === 'string'
          ? (req.body.status as LiveSessionPresenceStatus)
          : 'watching';
      if (!PRESENCE_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'INVALID_PRESENCE_STATUS' });
      }
      const presence = await liveSessionService.upsertPresence(req.params.id, {
        participantType: 'human',
        participantId: req.auth?.id as string,
        status,
      } as UpsertLivePresenceInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_presence',
        {
          sessionId: req.params.id,
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_presence_updated',
        fromRole: 'observer',
        toRole: 'author',
        payload: {
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      });
      res.json(presence);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/presence/agent',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const status =
        typeof req.body?.status === 'string'
          ? (req.body.status as LiveSessionPresenceStatus)
          : 'active';
      if (!PRESENCE_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'INVALID_PRESENCE_STATUS' });
      }
      const presence = await liveSessionService.upsertPresence(req.params.id, {
        participantType: 'agent',
        participantId: req.auth?.id as string,
        status,
      } as UpsertLivePresenceInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_presence',
        {
          sessionId: req.params.id,
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_presence_updated',
        fromRole: 'maker',
        toRole: 'author',
        payload: {
          participantType: presence.participantType,
          participantId: presence.participantId,
          status: presence.status,
          lastSeenAt: presence.lastSeenAt,
        },
      });
      res.json(presence);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/messages/observer',
  requireHuman,
  async (req, res, next) => {
    try {
      const content =
        typeof req.body?.content === 'string' ? req.body.content : '';
      const message = await liveSessionService.addMessage(req.params.id, {
        authorType: 'human',
        authorId: req.auth?.id as string,
        authorLabel: req.auth?.email ?? 'Observer',
        content,
      } as AddLiveMessageInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_chat_message',
        {
          sessionId: req.params.id,
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
          content: message.content,
          createdAt: message.createdAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_chat_message',
        fromRole: 'observer',
        toRole: 'author',
        payload: {
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
        },
      });
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/live-sessions/:id/messages/agent',
  requireVerifiedAgent,
  async (req, res, next) => {
    try {
      const content =
        typeof req.body?.content === 'string' ? req.body.content : '';
      const agentLabel =
        typeof req.body?.authorLabel === 'string' &&
        req.body.authorLabel.trim().length > 0
          ? req.body.authorLabel.trim()
          : `Agent ${String(req.auth?.id ?? '').slice(0, 8)}`;
      const message = await liveSessionService.addMessage(req.params.id, {
        authorType: 'agent',
        authorId: req.auth?.id as string,
        authorLabel: agentLabel,
        content,
      } as AddLiveMessageInput);
      getRealtime(req)?.broadcast(
        `session:${req.params.id}`,
        'session_chat_message',
        {
          sessionId: req.params.id,
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
          content: message.content,
          createdAt: message.createdAt,
        },
      );
      recordLiveGatewayEvent({
        sessionId: req.params.id,
        hostAgentId: req.auth?.id as string,
        eventType: 'live_chat_message',
        fromRole: 'maker',
        toRole: 'author',
        payload: {
          messageId: message.id,
          authorType: message.authorType,
          authorLabel: message.authorLabel,
        },
      });
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
