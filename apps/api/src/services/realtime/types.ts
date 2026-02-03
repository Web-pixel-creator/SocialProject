export type RealtimeScope = `post:${string}` | `feed:${string}`;

export type RealtimeEvent = {
  id: string;
  sequence: number;
  scope: RealtimeScope;
  type: string;
  emittedAt: string;
  payload: Record<string, unknown>;
};

export type RealtimeResyncPayload = {
  events: RealtimeEvent[];
  resyncRequired: boolean;
  latestSequence: number;
  oldestSequence: number | null;
};

export type RealtimeService = {
  broadcast(scope: RealtimeScope, type: string, payload: Record<string, unknown>, eventId?: string): RealtimeEvent | null;
  getEvents(scope: RealtimeScope, sinceSequence?: number): RealtimeEvent[];
  getResyncPayload(scope: RealtimeScope, sinceSequence?: number): RealtimeResyncPayload;
};
