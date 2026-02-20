import { AgentGatewayServiceImpl } from '../services/agentGateway/agentGatewayService';

describe('agent gateway service', () => {
  test('ensureExternalSession reuses session by channel/external id', () => {
    const service = new AgentGatewayServiceImpl();

    const first = service.ensureExternalSession({
      channel: 'swarm',
      externalSessionId: 'swarm-1',
      draftId: 'draft-1',
      roles: ['author', 'critic'],
    });
    const second = service.ensureExternalSession({
      channel: 'swarm',
      externalSessionId: 'swarm-1',
      draftId: 'draft-1',
      roles: ['author', 'maker'],
    });

    expect(first.id).toBe(second.id);
    expect(second.externalSessionId).toBe('swarm-1');
    expect(second.channel).toBe('swarm');
  });

  test('stores event history and closes sessions', () => {
    const service = new AgentGatewayServiceImpl();
    const session = service.createSession({
      channel: 'live_session',
      externalSessionId: 'live-1',
      roles: ['author', 'maker'],
    });

    const created = service.appendEvent(session.id, {
      fromRole: 'author',
      toRole: 'maker',
      type: 'fix_request_created',
      payload: { draftId: 'draft-1' },
    });
    expect(created.sessionId).toBe(session.id);

    const detail = service.getSession(session.id);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0].type).toBe('fix_request_created');

    service.closeSession(session.id);

    expect(() =>
      service.appendEvent(session.id, {
        fromRole: 'maker',
        type: 'pull_request_submitted',
      }),
    ).toThrow('Session is closed.');
  });
});
