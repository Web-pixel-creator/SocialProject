import { RealtimeServiceImpl } from '../services/realtime/realtimeService';

describe('realtime service edge cases', () => {
  test('returns null on duplicate event ids', () => {
    const service = new RealtimeServiceImpl();
    const first = service.broadcast(
      'post:draft-1',
      'fix_request',
      { id: '1' },
      'evt-dup',
    );
    const second = service.broadcast(
      'post:draft-1',
      'fix_request',
      { id: '1' },
      'evt-dup',
    );

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  test('trims replay buffer to size limit', () => {
    const service = new RealtimeServiceImpl();
    for (let i = 0; i < 105; i += 1) {
      service.broadcast('post:draft-1', 'fix_request', { id: String(i) });
    }

    const payload = service.getResyncPayload('post:draft-1');
    expect(payload.events.length).toBe(100);
    expect(payload.oldestSequence).toBeGreaterThan(1);
    expect(payload.latestSequence).toBe(105);
  });

  test('resyncRequired when events are missing', () => {
    const service = new RealtimeServiceImpl();
    for (let i = 0; i < 105; i += 1) {
      service.broadcast('post:draft-1', 'pull_request', { id: String(i) });
    }

    const payload = service.getResyncPayload('post:draft-1', 1);
    expect(payload.resyncRequired).toBe(true);
    expect(payload.events.length).toBe(0);
  });

  test('resync payload returns empty when no events exist', () => {
    const service = new RealtimeServiceImpl();
    const payload = service.getResyncPayload('post:draft-1', 5);
    expect(payload.events.length).toBe(0);
    expect(payload.resyncRequired).toBe(false);
    expect(payload.latestSequence).toBe(0);
  });

  test('getEvents filters when sinceSequence is provided', () => {
    const service = new RealtimeServiceImpl();
    service.broadcast('post:draft-1', 'fix_request', { id: '1' });
    service.broadcast('post:draft-1', 'fix_request', { id: '2' });
    service.broadcast('post:draft-1', 'fix_request', { id: '3' });

    const events = service.getEvents('post:draft-1', 1);
    expect(events).toHaveLength(2);
    expect(events[0].sequence).toBeGreaterThan(1);
  });

  test('resync payload returns filtered events when within buffer', () => {
    const service = new RealtimeServiceImpl();
    service.broadcast('post:draft-1', 'pull_request', { id: '1' });
    service.broadcast('post:draft-1', 'pull_request', { id: '2' });
    service.broadcast('post:draft-1', 'pull_request', { id: '3' });

    const payload = service.getResyncPayload('post:draft-1', 1);
    expect(payload.resyncRequired).toBe(false);
    expect(payload.events).toHaveLength(2);
  });

  test('broadcast falls back when crypto.randomUUID is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    if (descriptor && !descriptor.configurable) {
      const service = new RealtimeServiceImpl();
      expect(
        service.broadcast('post:draft-2', 'fix_request', { id: '1' }),
      ).toBeTruthy();
      return;
    }

    const originalCrypto = (globalThis as any).crypto;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: {},
        configurable: true,
      });
      const service = new RealtimeServiceImpl();
      const event = service.broadcast('post:draft-2', 'fix_request', {
        id: '1',
      });
      expect(event?.id).toContain('evt-');
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    }
  });

  test('broadcast emits to socket room when io is provided', () => {
    const emit = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit })),
    } as any;

    const service = new RealtimeServiceImpl(io);
    const event = service.broadcast('post:draft-1', 'fix_request', { id: '1' });

    expect(event).toBeTruthy();
    expect(io.to).toHaveBeenCalledWith('post:draft-1');
    expect(emit).toHaveBeenCalledWith(
      'event',
      expect.objectContaining({ scope: 'post:draft-1' }),
    );
  });
});
