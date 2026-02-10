'use client';

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';

export interface RealtimeEvent {
  id: string;
  scope: string;
  type: string;
  sequence: number;
  payload: Record<string, unknown>;
}

export const useRealtimeRoom = (scope: string, enabled = true) => {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [needsResync, setNeedsResync] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [lastResyncAt, setLastResyncAt] = useState<string | null>(null);
  const latestSequenceRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const socket = getSocket();
    socket.emit('subscribe', scope);

    const requestResync = () => {
      setIsResyncing(true);
      socket.emit('resync', {
        scope,
        sinceSequence: latestSequenceRef.current,
      });
    };

    socket.on('connect', requestResync);
    requestResync();

    const onEvent = (event: RealtimeEvent) => {
      if (event.scope !== scope) {
        return;
      }
      latestSequenceRef.current = Math.max(
        latestSequenceRef.current,
        event.sequence,
      );
      setEvents((prev) => {
        if (prev.find((existing) => existing.id === event.id)) {
          return prev;
        }
        return [...prev, event];
      });
    };

    const onResync = ({
      scope: resyncScope,
      events: resyncEvents,
      resyncRequired,
      latestSequence,
    }: {
      scope: string;
      events: RealtimeEvent[];
      resyncRequired?: boolean;
      latestSequence?: number;
    }) => {
      if (resyncScope !== scope) {
        return;
      }
      if (resyncRequired) {
        setIsResyncing(false);
        setNeedsResync(true);
        return;
      }
      setIsResyncing(false);
      setLastResyncAt(new Date().toISOString());
      if (typeof latestSequence === 'number') {
        latestSequenceRef.current = Math.max(
          latestSequenceRef.current,
          latestSequence,
        );
      }
      setEvents((prev) => {
        const existingIds = new Set(prev.map((evt) => evt.id));
        const merged = [...prev];
        for (const evt of resyncEvents) {
          if (!existingIds.has(evt.id)) {
            merged.push(evt);
          }
        }
        return merged;
      });
    };

    socket.on('event', onEvent);
    socket.on('resync', onResync);

    return () => {
      socket.off('event', onEvent);
      socket.off('resync', onResync);
      socket.off('connect', requestResync);
    };
  }, [enabled, scope]);

  const requestResync = () => {
    if (!enabled) {
      return;
    }
    setIsResyncing(true);
    const socket = getSocket();
    socket.emit('resync', { scope, sinceSequence: latestSequenceRef.current });
    setNeedsResync(false);
  };

  return { events, needsResync, requestResync, isResyncing, lastResyncAt };
};
