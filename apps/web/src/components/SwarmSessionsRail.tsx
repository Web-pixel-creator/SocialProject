'use client';

import useSWR from 'swr';
import { apiClient } from '../lib/api';

type SwarmStatus = 'forming' | 'active' | 'completed' | 'cancelled';

interface SwarmSessionSummary {
  id: string;
  title: string;
  objective: string;
  status: SwarmStatus;
  memberCount: number;
  judgeEventCount: number;
  lastActivityAt: string | Date;
  replayTimeline: SwarmReplayEvent[];
}

interface SwarmReplayEvent {
  id: string;
  eventType: string;
  score: number | null;
  notes: string;
  createdAt: string | Date;
}

const fallbackSessions: SwarmSessionSummary[] = [
  {
    id: 'fallback-swarm-1',
    title: 'Creative strike team',
    objective: 'Color + narrative polish in one pass',
    status: 'active',
    memberCount: 3,
    judgeEventCount: 2,
    lastActivityAt: new Date().toISOString(),
    replayTimeline: [
      {
        id: 'fallback-swarm-1-e1',
        eventType: 'checkpoint',
        score: 74,
        notes: 'Colorist pass improved balance and contrast consistency.',
        createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      },
      {
        id: 'fallback-swarm-1-e2',
        eventType: 'checkpoint',
        score: 79,
        notes: 'Storyteller tightened scene transitions and pacing.',
        createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      },
    ],
  },
  {
    id: 'fallback-swarm-2',
    title: 'Launch patch squad',
    objective: 'Fix final blockers before release',
    status: 'forming',
    memberCount: 2,
    judgeEventCount: 0,
    lastActivityAt: new Date().toISOString(),
    replayTimeline: [],
  },
];

const statusClassByValue: Record<SwarmStatus, string> = {
  forming: 'border border-border/35 bg-muted/40 text-muted-foreground',
  active: 'border border-primary/35 bg-primary/10 text-primary',
  completed: 'border border-chart-2/45 bg-chart-2/12 text-chart-2',
  cancelled: 'border border-destructive/45 bg-destructive/12 text-destructive',
};

const formatRelativeMinutes = (value: string | Date): string => {
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'just now';
  }
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

const fetchSwarms = async (): Promise<SwarmSessionSummary[]> => {
  const response = await apiClient.get('/swarms', {
    params: {
      status: 'active',
      limit: 3,
    },
  });
  if (!Array.isArray(response.data)) {
    return [];
  }

  const sessions = response.data.map((item: Record<string, unknown>) => ({
    id: String(item.id ?? ''),
    title: String(item.title ?? 'Untitled swarm'),
    objective: String(item.objective ?? 'No objective provided yet'),
    status: (item.status as SwarmStatus) ?? 'forming',
    memberCount: Number(item.memberCount ?? 0),
    judgeEventCount: Number(item.judgeEventCount ?? 0),
    lastActivityAt: String(item.lastActivityAt ?? new Date().toISOString()),
    replayTimeline: [] as SwarmReplayEvent[],
  }));

  const sessionsWithTimeline = await Promise.all(
    sessions.map(async (session) => {
      try {
        const detail = await apiClient.get(`/swarms/${session.id}`);
        const rawEvents = Array.isArray(detail.data?.judgeEvents)
          ? (detail.data.judgeEvents as Record<string, unknown>[])
          : [];
        const replayTimeline = rawEvents.slice(0, 3).map((event, index) => ({
          id: String(event.id ?? `${session.id}-event-${index}`),
          eventType: String(
            event.eventType ?? event.event_type ?? 'checkpoint',
          ),
          score:
            event.score == null || Number.isNaN(Number(event.score))
              ? null
              : Number(event.score),
          notes: String(event.notes ?? 'Judge update'),
          createdAt: String(
            event.createdAt ?? event.created_at ?? new Date().toISOString(),
          ),
        }));
        return { ...session, replayTimeline };
      } catch {
        return session;
      }
    }),
  );

  return sessionsWithTimeline;
};

export const SwarmSessionsRail = () => {
  const { data, isLoading } = useSWR<SwarmSessionSummary[]>(
    'feed-swarm-sessions',
    fetchSwarms,
    {
      fallbackData: fallbackSessions,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: 45_000,
    },
  );

  const sessions = data ?? fallbackSessions;

  return (
    <section className="card p-4" data-testid="swarm-sessions-rail">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Agent swarms
        </h3>
        <span className="pill">{sessions.length}</span>
      </header>
      <p className="mt-2 text-muted-foreground text-xs">
        Temporary studio teams with role-based execution and judge checkpoints.
      </p>

      <div className="mt-3 grid gap-2">
        {sessions.length === 0 && !isLoading ? (
          <p className="rounded-lg border border-border/30 bg-background/45 px-3 py-2 text-muted-foreground text-xs">
            No active swarms right now.
          </p>
        ) : null}
        {sessions.map((session) => (
          <article
            className="rounded-lg border border-border/30 bg-background/42 px-3 py-2"
            key={session.id}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 font-semibold text-foreground text-xs">
                {session.title}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide ${statusClassByValue[session.status] ?? statusClassByValue.forming}`}
              >
                {session.status}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
              {session.objective}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="pill">{session.memberCount} members</span>
              <span className="pill">
                {session.judgeEventCount} judge events
              </span>
              <span className="pill">
                {formatRelativeMinutes(session.lastActivityAt)}
              </span>
            </div>
            {session.replayTimeline.length > 0 ? (
              <div className="mt-2 space-y-1.5 border-border/25 border-t pt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Replay timeline
                </p>
                {session.replayTimeline.map((event) => (
                  <div
                    className="rounded-md border border-border/25 bg-background/52 px-2 py-1.5"
                    key={event.id}
                  >
                    <p className="line-clamp-1 font-semibold text-[10px] text-foreground uppercase tracking-wide">
                      {event.eventType}
                      {event.score !== null ? ` · ${event.score}` : ''}
                    </p>
                    <p className="line-clamp-2 text-[10px] text-muted-foreground">
                      {event.notes}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};
