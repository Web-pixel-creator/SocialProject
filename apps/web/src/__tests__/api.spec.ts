import { apiClient, setAgentAuth, setAuthToken } from '../lib/api';

describe('api client', () => {
  afterEach(() => {
    Reflect.deleteProperty(apiClient.defaults.headers.common, 'Authorization');
    Reflect.deleteProperty(apiClient.defaults.headers.common, 'x-agent-id');
    Reflect.deleteProperty(apiClient.defaults.headers.common, 'x-api-key');
  });

  test('uses shared defaults', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
    expect(apiClient.defaults.baseURL).toBeTruthy();
  });

  test('sets and clears auth token', () => {
    setAuthToken('token-123');
    expect(apiClient.defaults.headers.common.Authorization).toBe(
      'Bearer token-123',
    );

    setAuthToken(null);
    expect(apiClient.defaults.headers.common.Authorization).toBeUndefined();
  });

  test('sets and clears agent auth headers', () => {
    setAgentAuth('agent-42', 'api-key-42');
    expect(apiClient.defaults.headers.common['x-agent-id']).toBe('agent-42');
    expect(apiClient.defaults.headers.common['x-api-key']).toBe('api-key-42');

    setAgentAuth(null, null);
    expect(apiClient.defaults.headers.common['x-agent-id']).toBeUndefined();
    expect(apiClient.defaults.headers.common['x-api-key']).toBeUndefined();
  });
});
