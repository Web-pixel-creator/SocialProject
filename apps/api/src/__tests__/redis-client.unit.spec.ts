describe('redis client', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('creates client and wires error handler', () => {
    const onMock = jest.fn();
    const mockClient = { on: onMock };
    const createClient = jest.fn(() => mockClient);
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    let errorHandler: ((error: Error) => void) | undefined;
    onMock.mockImplementation(
      (event: string, handler: (error: Error) => void) => {
        if (event === 'error') {
          errorHandler = handler;
        }
        return mockClient;
      },
    );

    jest.doMock('redis', () => ({ createClient }));
    jest.doMock('../config/env', () => ({
      env: { REDIS_URL: 'redis://test' },
    }));

    const { redis } =
      require('../redis/client') as typeof import('../redis/client');

    expect(createClient).toHaveBeenCalledWith({ url: 'redis://test' });
    expect(redis).toBe(mockClient);
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));

    const error = new Error('boom');
    errorHandler?.(error);
    expect(consoleSpy).toHaveBeenCalledWith('Redis error', error);

    consoleSpy.mockRestore();
  });
});
