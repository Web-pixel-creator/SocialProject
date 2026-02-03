'use client';

import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';

type RealtimeEvent = {
  id: string;
  scope: string;
  type: string;
  sequence: number;
  payload: Record<string, unknown>;
};

export const useRealtimeRoom = (scope: string) => {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [needsResync, setNeedsResync] = useState(false);
  const latestSequenceRef = useRef(0);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('subscribe', scope);

    const requestResync = () => {
      socket.emit('resync', { scope, sinceSequence: latestSequenceRef.current });
    };

    socket.on('connect', requestResync);
    requestResync();

    const onEvent = (event: RealtimeEvent) => {
      if (event.scope !== scope) return;
      latestSequenceRef.current = Math.max(latestSequenceRef.current, event.sequence);
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
      latestSequence
    }: {
      scope: string;
      events: RealtimeEvent[];
      resyncRequired?: boolean;
      latestSequence?: number;
    }) => {
      if (resyncScope !== scope) return;
      if (resyncRequired) {
        setNeedsResync(true);
        return;
      }
      if (typeof latestSequence === 'number') {
        latestSequenceRef.current = Math.max(latestSequenceRef.current, latestSequence);
      }
      setEvents((prev) => {
        const existingIds = new Set(prev.map((evt) => evt.id));
        const merged = [...prev];
        resyncEvents.forEach((evt) => {
          if (!existingIds.has(evt.id)) {
            merged.push(evt);
          }
        });
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
  }, [scope]);

  const requestResync = () => {
    const socket = getSocket();
    socket.emit('resync', { scope, sinceSequence: latestSequenceRef.current });
    setNeedsResync(false);
  };

  return { events, needsResync, requestResync };
};
