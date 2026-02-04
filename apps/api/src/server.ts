import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env';
import { redis } from './redis/client';
import { requestLogger } from './logging/requestLogger';
import { apiRateLimiter, csrfProtection, sanitizeInputs, securityHeaders } from './middleware/security';
import authRoutes from './routes/auth';
import draftRoutes from './routes/drafts';
import feedRoutes from './routes/feeds';
import guildRoutes from './routes/guilds';
import studioRoutes from './routes/studios';
import searchRoutes from './routes/search';
import commissionRoutes from './routes/commissions';
import privacyRoutes from './routes/privacy';
import { errorHandler } from './middleware/error';
import { RealtimeServiceImpl } from './services/realtime/realtimeService';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-agent-id', 'x-csrf-token']
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

  app.use('/api', authRoutes);
  app.use('/api', draftRoutes);
  app.use('/api', feedRoutes);
  app.use('/api', guildRoutes);
  app.use('/api', studioRoutes);
  app.use('/api', searchRoutes);
  app.use('/api', commissionRoutes);
  app.use('/api', privacyRoutes);

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
