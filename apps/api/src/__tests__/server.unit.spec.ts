describe('server setup', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('createServer wires realtime and socket events', () => {
    const join = jest.fn();
    const onSocket = jest.fn(
      (event: string, handler: (...args: any[]) => void) => {
        if (event === 'subscribe') {
          handler('feed:live');
        }
        if (event === 'resync') {
          handler({ scope: 'post:1', sinceSequence: 10 });
        }
      },
    );
    const socket = { on: onSocket, join, emit: jest.fn() };
    const onIo = jest.fn(
      (event: string, handler: (socket: typeof socket) => void) => {
        if (event === 'connection') {
          handler(socket);
        }
      },
    );

    const ioInstance = { on: onIo };
    const httpServer = { on: jest.fn() };
    const createServerMock = jest.fn(() => httpServer);
    const socketServerMock = jest.fn(() => ioInstance);

    const getResyncPayload = jest.fn(() => ({
      events: [],
      latestSequence: 10,
      resyncRequired: false,
    }));
    const realtimeInstance = { getResyncPayload };

    jest.doMock('node:http', () => ({ createServer: createServerMock }));
    jest.doMock('socket.io', () => ({
      Server: socketServerMock,
    }));
    jest.doMock('../services/realtime/realtimeService', () => ({
      RealtimeServiceImpl: jest.fn(() => realtimeInstance),
    }));

    const setMock = jest.fn();
    const useMock = jest.fn();
    const getMock = jest.fn();
    const expressFn = () => ({ set: setMock, use: useMock, get: getMock });
    expressFn.json = jest.fn(() => ({}));
    jest.doMock('express', () => expressFn);
    jest.doMock('cors', () => () => ({}));
    jest.doMock('../middleware/security', () => ({
      apiRateLimiter: jest.fn(),
      csrfProtection: jest.fn(),
      sanitizeInputs: jest.fn(),
      securityHeaders: jest.fn(),
    }));
    jest.doMock('../logging/requestLogger', () => ({
      requestLogger: jest.fn(),
    }));
    jest.doMock('../middleware/error', () => ({ errorHandler: jest.fn() }));
    jest.doMock('../routes/auth', () => ({}));
    jest.doMock('../routes/admin', () => ({}));
    jest.doMock('../routes/drafts', () => ({}));
    jest.doMock('../routes/feeds', () => ({}));
    jest.doMock('../routes/guilds', () => ({}));
    jest.doMock('../routes/studios', () => ({}));
    jest.doMock('../routes/search', () => ({}));
    jest.doMock('../routes/commissions', () => ({}));
    jest.doMock('../routes/privacy', () => ({}));
    jest.doMock('../routes/telemetry', () => ({}));
    jest.doMock('../routes/demo', () => ({}));
    jest.doMock('../routes/observers', () => ({}));
    jest.doMock('../db/pool', () => ({
      db: { query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) },
    }));
    jest.doMock('../redis/client', () => ({
      redis: { isOpen: true, connect: jest.fn() },
    }));
    jest.doMock('../config/env', () => ({
      env: { FRONTEND_URL: 'http://localhost:3000', LOG_LEVEL: 'info' },
    }));

    const { createServer } = require('../server') as typeof import('../server');
    const result = createServer();

    expect(createServerMock).toHaveBeenCalled();
    expect(socketServerMock).toHaveBeenCalledWith(httpServer, {
      cors: { origin: 'http://localhost:3000', credentials: true },
    });
    expect(setMock).toHaveBeenCalledWith('realtime', realtimeInstance);
    expect(onIo).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(onSocket).toHaveBeenCalledWith('subscribe', expect.any(Function));
    expect(onSocket).toHaveBeenCalledWith('resync', expect.any(Function));
    expect(join).toHaveBeenCalledWith('feed:live');
    expect(getResyncPayload).toHaveBeenCalledWith('post:1', 10);
    expect(socket.emit).toHaveBeenCalledWith('resync', {
      scope: 'post:1',
      events: [],
      latestSequence: 10,
      resyncRequired: false,
    });
    expect(result.realtime).toBe(realtimeInstance);
  });

  test('initInfra connects when redis is closed', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../redis/client', () => ({
      redis: { isOpen: false, connect },
    }));
    jest.doMock('../routes/observers', () => ({}));

    const { initInfra } = require('../server') as typeof import('../server');
    await initInfra();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  test('createApp responds to health check', async () => {
    const appMock = {
      use: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      address: () => ({}),
    };
    const expressFn = () => appMock;
    expressFn.json = jest.fn(() => ({}));
    jest.doMock('express', () => expressFn);
    jest.doMock('cors', () => () => ({}));
    jest.doMock('../middleware/security', () => ({
      apiRateLimiter: jest.fn(),
      csrfProtection: jest.fn(),
      sanitizeInputs: jest.fn(),
      securityHeaders: jest.fn(),
    }));
    jest.doMock('../logging/requestLogger', () => ({
      requestLogger: jest.fn(),
    }));
    jest.doMock('../middleware/error', () => ({ errorHandler: jest.fn() }));
    jest.doMock('../routes/auth', () => ({}));
    jest.doMock('../routes/admin', () => ({}));
    jest.doMock('../routes/drafts', () => ({}));
    jest.doMock('../routes/feeds', () => ({}));
    jest.doMock('../routes/guilds', () => ({}));
    jest.doMock('../routes/studios', () => ({}));
    jest.doMock('../routes/search', () => ({}));
    jest.doMock('../routes/commissions', () => ({}));
    jest.doMock('../routes/privacy', () => ({}));
    jest.doMock('../routes/telemetry', () => ({}));
    jest.doMock('../routes/demo', () => ({}));
    jest.doMock('../routes/observers', () => ({}));
    jest.doMock('../db/pool', () => ({
      db: { query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) },
    }));
    jest.doMock('../redis/client', () => ({
      redis: { isOpen: true, connect: jest.fn() },
    }));
    jest.doMock('../config/env', () => ({
      env: { FRONTEND_URL: 'http://localhost:3000', LOG_LEVEL: 'info' },
    }));
    const { createApp } = require('../server') as typeof import('../server');

    const app = createApp() as typeof appMock;
    expect(app).toBe(appMock);
    const healthHandler = app.get.mock.calls.find(
      (call) => call[0] === '/health',
    )?.[1];
    expect(typeof healthHandler).toBe('function');

    const res = { json: jest.fn() };
    healthHandler({}, res);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });

    const readyHandler = app.get.mock.calls.find(
      (call) => call[0] === '/ready',
    )?.[1];
    expect(typeof readyHandler).toBe('function');
    const readyRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await readyHandler({}, readyRes);
    expect(readyRes.json).toHaveBeenCalledWith({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
    });
    return;
  });

  test('createApp enables trust proxy in production', () => {
    const appMock = {
      use: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      address: () => ({}),
    };
    const expressFn = () => appMock;
    expressFn.json = jest.fn(() => ({}));
    jest.doMock('express', () => expressFn);
    jest.doMock('cors', () => () => ({}));
    jest.doMock('../middleware/security', () => ({
      apiRateLimiter: jest.fn(),
      csrfProtection: jest.fn(),
      sanitizeInputs: jest.fn(),
      securityHeaders: jest.fn(),
    }));
    jest.doMock('../logging/requestLogger', () => ({
      requestLogger: jest.fn(),
    }));
    jest.doMock('../middleware/error', () => ({ errorHandler: jest.fn() }));
    jest.doMock('../routes/auth', () => ({}));
    jest.doMock('../routes/admin', () => ({}));
    jest.doMock('../routes/drafts', () => ({}));
    jest.doMock('../routes/feeds', () => ({}));
    jest.doMock('../routes/guilds', () => ({}));
    jest.doMock('../routes/studios', () => ({}));
    jest.doMock('../routes/search', () => ({}));
    jest.doMock('../routes/commissions', () => ({}));
    jest.doMock('../routes/privacy', () => ({}));
    jest.doMock('../routes/telemetry', () => ({}));
    jest.doMock('../routes/demo', () => ({}));
    jest.doMock('../routes/observers', () => ({}));
    jest.doMock('../db/pool', () => ({
      db: { query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) },
    }));
    jest.doMock('../redis/client', () => ({
      redis: { isOpen: true, connect: jest.fn() },
    }));
    jest.doMock('../config/env', () => ({
      env: {
        FRONTEND_URL: 'http://localhost:3000',
        LOG_LEVEL: 'info',
        NODE_ENV: 'production',
      },
    }));

    const { createApp } = require('../server') as typeof import('../server');
    createApp();

    expect(appMock.set).toHaveBeenCalledWith('trust proxy', 1);
  });
});
