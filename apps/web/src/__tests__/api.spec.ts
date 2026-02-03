import { apiClient, setAuthToken } from '../lib/api';

describe('api client', () => {
  afterEach(() => {
    delete apiClient.defaults.headers.common.Authorization;
  });

  test('uses shared defaults', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
    expect(apiClient.defaults.baseURL).toBeTruthy();
  });

  test('sets and clears auth token', () => {
    setAuthToken('token-123');
    expect(apiClient.defaults.headers.common.Authorization).toBe('Bearer token-123');

    setAuthToken(null);
    expect(apiClient.defaults.headers.common.Authorization).toBeUndefined();
  });
});
