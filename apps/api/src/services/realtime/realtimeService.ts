import type { Server } from 'socket.io';
import type {
  RealtimeEvent,
  RealtimeResyncPayload,
  RealtimeScope,
  RealtimeService,
} from './types';

const BUFFER_SIZE = 100;

interface ScopeState {
  sequence: number;
  events: RealtimeEvent[];
  seenIds: Set<string>;
}

export class RealtimeServiceImpl implements RealtimeService {
  private readonly io?: Server;
  private readonly scopes = new Map<RealtimeScope, ScopeState>();

  constructor(io?: Server) {
    this.io = io;
  }

  broadcast(
    scope: RealtimeScope,
    type: string,
    payload: Record<string, unknown>,
    eventId?: string,
  ): RealtimeEvent | null {
    const state = this.getScopeState(scope);
    const id =
      eventId ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    if (state.seenIds.has(id)) {
      return null;
    }

    const event: RealtimeEvent = {
      id,
      sequence: ++state.sequence,
      scope,
      type,
      emittedAt: new Date().toISOString(),
      payload,
    };

    state.seenIds.add(id);
    state.events.push(event);
    if (state.events.length > BUFFER_SIZE) {
      state.events.shift();
    }

    if (this.io) {
      this.io.to(scope).emit('event', event);
    }

    return event;
  }

  getEvents(scope: RealtimeScope, sinceSequence?: number): RealtimeEvent[] {
    const state = this.getScopeState(scope);
    if (sinceSequence == null) {
      return [...state.events];
    }

    return state.events.filter((event) => event.sequence > sinceSequence);
  }

  getResyncPayload(
    scope: RealtimeScope,
    sinceSequence?: number,
  ): RealtimeResyncPayload {
    const state = this.getScopeState(scope);
    const oldestSequence =
      state.events.length > 0 ? state.events[0].sequence : null;
    const latestSequence = state.sequence;

    if (sinceSequence == null) {
      return {
        events: [...state.events],
        resyncRequired: false,
        latestSequence,
        oldestSequence,
      };
    }

    if (oldestSequence != null && sinceSequence < oldestSequence) {
      return {
        events: [],
        resyncRequired: true,
        latestSequence,
        oldestSequence,
      };
    }

    return {
      events: state.events.filter((event) => event.sequence > sinceSequence),
      resyncRequired: false,
      latestSequence,
      oldestSequence,
    };
  }

  private getScopeState(scope: RealtimeScope): ScopeState {
    const existing = this.scopes.get(scope);
    if (existing) {
      return existing;
    }

    const state: ScopeState = {
      sequence: 0,
      events: [],
      seenIds: new Set(),
    };
    this.scopes.set(scope, state);
    return state;
  }
}
