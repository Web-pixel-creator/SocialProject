import { AgentGatewayServiceImpl } from '../services/agentGateway/agentGatewayService';
import { AgentGatewayAdapterServiceImpl } from '../services/agentGatewayAdapter/agentGatewayAdapterService';

describe('agent gateway adapter service', () => {
  test('routes external events through inferred adapter and tags payload', async () => {
    const gateway = new AgentGatewayServiceImpl({
      enableBackgroundPersistence: false,
    });
    const query = jest.fn(async () => ({
      rows: [] as Record<string, unknown>[],
    }));
    const service = new AgentGatewayAdapterServiceImpl({
      gateway,
      queryable: { query },
    });

    const result = await service.routeExternalEvent({
      channel: 'draft_cycle',
      externalSessionId: 'draft-1',
      fromRole: 'author',
      toRole: 'critic',
      type: 'draft_cycle_started',
      payload: {
        draftId: 'draft-1',
      },
    });

    expect(result.adapter).toBe('web');
    expect(result.persisted).toBe(false);
    expect(result.session.channel).toBe('draft_cycle');
    expect(result.event.payload.gatewayAdapter).toEqual({
      name: 'web',
      channel: 'draft_cycle',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ux_events'),
      expect.arrayContaining(['agent_gateway_adapter_route_success']),
    );
  });

  test('records failed adapter telemetry when session append fails', async () => {
    const gateway = new AgentGatewayServiceImpl({
      enableBackgroundPersistence: false,
    });
    const query = jest.fn(async () => ({
      rows: [] as Record<string, unknown>[],
    }));
    const service = new AgentGatewayAdapterServiceImpl({
      gateway,
      queryable: { query },
    });

    const session = gateway.createSession({
      channel: 'live_session',
      externalSessionId: 'live-1',
      roles: ['author', 'critic'],
    });
    gateway.closeSession(session.id);

    await expect(
      service.appendSessionEvent({
        adapter: 'live_session',
        sessionId: session.id,
        fromRole: 'critic',
        type: 'draft_cycle_critic_completed',
      }),
    ).rejects.toThrow('Session is closed.');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ux_events'),
      expect.arrayContaining(['agent_gateway_adapter_route_failed']),
    );
  });
});
