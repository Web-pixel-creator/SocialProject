describe('api index bootstrap', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('starts server and scheduler when infra is ready', async () => {
    const listen = jest.fn((_port: number, cb: () => void) => cb());
    const createServer = jest.fn(() => ({ httpServer: { listen } }));
    const initInfra = jest.fn().mockResolvedValue(undefined);
    const startScheduler = jest.fn();
    const loggerInfo = jest.fn();
    const loggerError = jest.fn();

    jest.doMock('../server', () => ({ createServer, initInfra }));
    jest.doMock('../jobs/scheduler', () => ({ startScheduler }));
    jest.doMock('../logging/logger', () => ({
      logger: { info: loggerInfo, error: loggerError }
    }));
    jest.doMock('../config/env', () => ({ env: { PORT: 4567 } }));
    const db = { id: 'db' };
    jest.doMock('../db/pool', () => ({ db }));

    jest.isolateModules(() => {
      require('../index');
    });

    await Promise.resolve();

    expect(createServer).toHaveBeenCalledTimes(1);
    expect(initInfra).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(4567, expect.any(Function));
    expect(loggerInfo).toHaveBeenCalledWith({ port: 4567 }, 'API listening');
    expect(startScheduler).toHaveBeenCalledWith(db);
    expect(loggerError).not.toHaveBeenCalled();
  });

  test('logs error and exits when infra fails', async () => {
    const error = new Error('boot fail');
    const createServer = jest.fn(() => ({ httpServer: { listen: jest.fn() } }));
    const initInfra = jest.fn().mockRejectedValue(error);
    const startScheduler = jest.fn();
    const loggerInfo = jest.fn();
    const loggerError = jest.fn();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    jest.doMock('../server', () => ({ createServer, initInfra }));
    jest.doMock('../jobs/scheduler', () => ({ startScheduler }));
    jest.doMock('../logging/logger', () => ({
      logger: { info: loggerInfo, error: loggerError }
    }));
    jest.doMock('../config/env', () => ({ env: { PORT: 4567 } }));
    jest.doMock('../db/pool', () => ({ db: {} }));

    jest.isolateModules(() => {
      require('../index');
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(initInfra).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith({ err: error }, 'Failed to start services');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
