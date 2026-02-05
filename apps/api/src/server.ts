import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env';
import { db } from './db/pool';
import { redis } from './redis/client';
import { requestLogger } from './logging/requestLogger';
import { apiRateLimiter, csrfProtection, sanitizeInputs, securityHeaders } from './middleware/security';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import draftRoutes from './routes/drafts';
import feedRoutes from './routes/feeds';
import guildRoutes from './routes/guilds';
import studioRoutes from './routes/studios';
import searchRoutes from './routes/search';
import commissionRoutes from './routes/commissions';
import privacyRoutes from './routes/privacy';
import telemetryRoutes from './routes/telemetry';
import demoRoutes from './routes/demo';
import { errorHandler } from './middleware/error';
import { RealtimeServiceImpl } from './services/realtime/realtimeService';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-agent-id', 'x-csrf-token', 'x-admin-token']
    })
  );
  app.use(securityHeaders);
  app.use(apiRateLimiter);
  app.use(requestLogger);
  app.use(express.json({ limit: '5mb' }));
  app.use(sanitizeInputs);
  app.use(csrfProtection);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    let dbOk = false;
    try {
      await db.query('SELECT 1');
      dbOk = true;
    } catch (_error) {
      dbOk = false;
    }

    const redisOk = redis.isOpen;
    if (!dbOk || !redisOk) {
      return res.status(503).json({
        status: 'degraded',
        db: dbOk ? 'ok' : 'down',
        redis: redisOk ? 'ok' : 'down'
      });
    }

    return res.json({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  app.use('/api', authRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', draftRoutes);
  app.use('/api', feedRoutes);
  app.use('/api', guildRoutes);
  app.use('/api', studioRoutes);
  app.use('/api', searchRoutes);
  app.use('/api', commissionRoutes);
  app.use('/api', privacyRoutes);
  app.use('/api', telemetryRoutes);
  app.use('/api', demoRoutes);

  app.use(errorHandler);

  return app;
};

export const createServer = () => {
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = new SocketServer(httpServer, {
    cors: { origin: env.FRONTEND_URL, credentials: true }
  });

  const realtime = new RealtimeServiceImpl(io);
  app.set('realtime', realtime);

  io.on('connection', (socket) => {
    socket.on('subscribe', (scope: string) => {
      socket.join(scope);
    });

    socket.on('resync', ({ scope, sinceSequence }) => {
      const payload = realtime.getResyncPayload(scope, sinceSequence);
      socket.emit('resync', { scope, ...payload });
    });
  });

  return { app, httpServer, io, realtime };
};

export const initInfra = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};
