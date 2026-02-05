const ORIGINAL_ENV = process.env;

describe('config', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('uses default URLs when env is missing', () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_WS_BASE_URL;
    const { API_BASE_URL, WS_BASE_URL } = require('../lib/config');
    expect(API_BASE_URL).toBe('http://localhost:4000/api');
    expect(WS_BASE_URL).toBe('ws://localhost:4000');
  });

  test('uses env overrides when provided', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.finishit.test';
    process.env.NEXT_PUBLIC_WS_BASE_URL = 'wss://ws.finishit.test';
    const { API_BASE_URL, WS_BASE_URL } = require('../lib/config');
    expect(API_BASE_URL).toBe('https://api.finishit.test');
    expect(WS_BASE_URL).toBe('wss://ws.finishit.test');
  });
});
