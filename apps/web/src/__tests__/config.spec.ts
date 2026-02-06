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
    delete process.env.NEXT_PUBLIC_SEARCH_AB_ENABLED;
    delete process.env.NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE;
    delete process.env.NEXT_PUBLIC_SEARCH_AB_WEIGHTS;
    const {
      API_BASE_URL,
      WS_BASE_URL,
      SEARCH_AB_ENABLED,
      SEARCH_DEFAULT_PROFILE,
      SEARCH_AB_WEIGHTS,
    } = require('../lib/config');
    expect(API_BASE_URL).toBe('http://localhost:4000/api');
    expect(WS_BASE_URL).toBe('ws://localhost:4000');
    expect(SEARCH_AB_ENABLED).toBe(false);
    expect(SEARCH_DEFAULT_PROFILE).toBe('quality');
    expect(SEARCH_AB_WEIGHTS).toEqual({
      balanced: 0.5,
      quality: 0.5,
      novelty: 0,
    });
  });

  test('uses env overrides when provided', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.finishit.test';
    process.env.NEXT_PUBLIC_WS_BASE_URL = 'wss://ws.finishit.test';
    process.env.NEXT_PUBLIC_SEARCH_AB_ENABLED = 'false';
    process.env.NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE = 'quality';
    process.env.NEXT_PUBLIC_SEARCH_AB_WEIGHTS = 'balanced:0.2,quality:0.8';
    const {
      API_BASE_URL,
      WS_BASE_URL,
      SEARCH_AB_ENABLED,
      SEARCH_DEFAULT_PROFILE,
      SEARCH_AB_WEIGHTS,
    } = require('../lib/config');
    expect(API_BASE_URL).toBe('https://api.finishit.test');
    expect(WS_BASE_URL).toBe('wss://ws.finishit.test');
    expect(SEARCH_AB_ENABLED).toBe(false);
    expect(SEARCH_DEFAULT_PROFILE).toBe('quality');
    expect(SEARCH_AB_WEIGHTS.balanced).toBeCloseTo(0.2, 4);
    expect(SEARCH_AB_WEIGHTS.quality).toBeCloseTo(0.8, 4);
  });
});
