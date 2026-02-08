import type { DbClient } from '../services/auth/types';
import { HeartbeatServiceImpl } from '../services/heartbeat/heartbeatService';

const createClient = () =>
  ({
    query: jest.fn(),
  }) as unknown as DbClient;

describe('heartbeat service', () => {
  test('recordHeartbeat writes defaults and truncates long messages', async () => {
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    const longMessage = 'x'.repeat(400);

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'agent-1',
          last_heartbeat_at: null,
          heartbeat_status: 'active',
          heartbeat_message: longMessage.slice(0, 280),
        },
      ],
    });

    const service = new HeartbeatServiceImpl(client);
    const result = await service.recordHeartbeat('agent-1', {
      message: longMessage,
    });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      'agent-1',
      'active',
      longMessage.slice(0, 280),
    ]);
    expect(result.agentId).toBe('agent-1');
    expect(result.status).toBe('active');
    expect(result.message).toBe(longMessage.slice(0, 280));
    expect(result.lastHeartbeatAt).toBeTruthy();
    expect(result.isActive).toBe(true);
  });

  test('recordHeartbeat allows explicit status and null message', async () => {
    const client = createClient();
    const queryMock = client.query as jest.Mock;

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'agent-2',
          last_heartbeat_at: new Date().toISOString(),
          heartbeat_status: 'busy',
          heartbeat_message: null,
        },
      ],
    });

    const service = new HeartbeatServiceImpl(client);
    const result = await service.recordHeartbeat('agent-2', { status: 'busy' });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      'agent-2',
      'busy',
      null,
    ]);
    expect(result.status).toBe('busy');
    expect(result.message).toBeNull();
    expect(result.isActive).toBe(true);
  });

  test('recordHeartbeat throws when agent is missing', async () => {
    const client = createClient();
    (client.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const service = new HeartbeatServiceImpl(client);

    await expect(service.recordHeartbeat('missing')).rejects.toMatchObject({
      code: 'AGENT_NOT_FOUND',
      status: 404,
    });
  });

  test('getHeartbeat returns idle and inactive for stale timestamp', async () => {
    const client = createClient();
    const staleDate = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'agent-3',
          last_heartbeat_at: staleDate,
          heartbeat_status: null,
          heartbeat_message: null,
        },
      ],
    });

    const service = new HeartbeatServiceImpl(client);
    const result = await service.getHeartbeat('agent-3');

    expect(result.status).toBe('idle');
    expect(result.message).toBeNull();
    expect(result.lastHeartbeatAt).toBe(new Date(staleDate).toISOString());
    expect(result.isActive).toBe(false);
  });

  test('getHeartbeat parses timestamp strings without timezone as UTC', async () => {
    const client = createClient();
    const recentNoOffset = new Date().toISOString().replace('Z', '');
    (client.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'agent-4',
          last_heartbeat_at: recentNoOffset,
          heartbeat_status: 'active',
          heartbeat_message: 'ok',
        },
      ],
    });

    const service = new HeartbeatServiceImpl(client);
    const result = await service.getHeartbeat('agent-4');

    expect(result.lastHeartbeatAt).toBe(new Date(`${recentNoOffset}Z`).toISOString());
    expect(result.isActive).toBe(true);
  });

  test('getHeartbeat handles Date objects and invalid timestamps', async () => {
    const client = createClient();
    const queryMock = client.query as jest.Mock;
    const now = new Date();

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'agent-5',
            last_heartbeat_at: now,
            heartbeat_status: 'active',
            heartbeat_message: 'date object',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'agent-6',
            last_heartbeat_at: 'not-a-date',
            heartbeat_status: 'active',
            heartbeat_message: 'bad timestamp',
          },
        ],
      });

    const service = new HeartbeatServiceImpl(client);
    const withDateObject = await service.getHeartbeat('agent-5');
    expect(withDateObject.lastHeartbeatAt).toBe(now.toISOString());
    expect(withDateObject.isActive).toBe(true);

    const withInvalidDate = await service.getHeartbeat('agent-6');
    expect(withInvalidDate.lastHeartbeatAt).toBeNull();
    expect(withInvalidDate.isActive).toBe(false);
  });

  test('getHeartbeat throws when agent is missing', async () => {
    const client = createClient();
    (client.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const service = new HeartbeatServiceImpl(client);

    await expect(service.getHeartbeat('missing')).rejects.toMatchObject({
      code: 'AGENT_NOT_FOUND',
      status: 404,
    });
  });
});
