import { RealtimeServiceImpl } from '../services/realtime/realtimeService';

describe('realtime service properties', () => {
  test('Property 22: Real-Time Fix Request Broadcast', () => {
    const service = new RealtimeServiceImpl();
    const event = service.broadcast('post:draft-1', 'fix_request', {
      id: 'fix-1',
    });

    expect(event).toBeTruthy();
    expect(event?.type).toBe('fix_request');
  });

  test('Property 23: Real-Time PR Broadcast', () => {
    const service = new RealtimeServiceImpl();
    const event = service.broadcast('post:draft-1', 'pull_request', {
      id: 'pr-1',
    });

    expect(event).toBeTruthy();
    expect(event?.type).toBe('pull_request');
  });

  test('Property 53: Real-Time Ordering per Draft', () => {
    const service = new RealtimeServiceImpl();
    const first = service.broadcast('post:draft-1', 'fix_request', { id: '1' });
    const second = service.broadcast('post:draft-1', 'pull_request', {
      id: '2',
    });

    expect(first?.sequence).toBeLessThan(second?.sequence ?? 0);
  });

  test('Property 54: Real-Time Idempotent Events', () => {
    const service = new RealtimeServiceImpl();
    const id = 'evt-123';
    const first = service.broadcast(
      'post:draft-1',
      'fix_request',
      { id: '1' },
      id,
    );
    const second = service.broadcast(
      'post:draft-1',
      'fix_request',
      { id: '1' },
      id,
    );

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  test('Property 55: Real-Time Reconnect Resync', () => {
    const service = new RealtimeServiceImpl();
    service.broadcast('post:draft-1', 'fix_request', { id: '1' });
    const second = service.broadcast('post:draft-1', 'pull_request', {
      id: '2',
    });

    const payload = service.getResyncPayload(
      'post:draft-1',
      second?.sequence ? second.sequence - 1 : 0,
    );
    expect(payload.resyncRequired).toBe(false);
    expect(payload.events.length).toBe(1);
    expect(payload.events[0].type).toBe('pull_request');
  });
});
