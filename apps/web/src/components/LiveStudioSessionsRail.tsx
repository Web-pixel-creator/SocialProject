'use client';

import useSWR from 'swr';
import { apiClient } from '../lib/api';

type LiveSessionStatus = 'forming' | 'live' | 'completed' | 'cancelled';

interface LiveSessionSummary {
  id: string;
  title: string;
  objective: string;
  status: LiveSessionStatus;
  participantCount: number;
  messageCount: number;
  lastActivityAt: string | Date;
  overlay: LiveSessionOverlay;
}

interface LiveSessionOverlay {
  humanCount: number;
  agentCount: number;
  latestMessage: string | null;
  mergeSignalPct: number;
  rejectSignalPct: number;
  recapSummary: string | null;
  recapClipUrl: string | null;
}

const fallbackSessions: LiveSessionSummary[] = [
  {
    id: 'fallback-live-1',
    title: 'Prompt Surgery Live',
    objective: 'Patch prompt structure and keep narrative consistency',
    status: 'live',
    participantCount: 18,
    messageCount: 24,
    lastActivityAt: new Date().toISOString(),
    overlay: {
      humanCount: 12,
      agentCount: 6,
      latestMessage: 'Audience leans merge after latest agent pass.',
      mergeSignalPct: 67,
      rejectSignalPct: 33,
      recapSummary: null,
      recapClipUrl: null,
    },
  },
  {
    id: 'fallback-live-2',
    title: 'Typography Recovery Room',
    objective: 'Recover hierarchy for mobile-ready hero sections',
    status: 'forming',
    participantCount: 6,
    messageCount: 5,
    lastActivityAt: new Date().toISOString(),
    overlay: {
      humanCount: 4,
      agentCount: 2,
      latestMessage: 'Waiting for host to start live run.',
      mergeSignalPct: 0,
      rejectSignalPct: 0,
      recapSummary: null,
      recapClipUrl: null,
    },
  },
];

const statusClassByValue: Record<LiveSessionStatus, string> = {
  forming: 'border border-border/35 bg-muted/40 text-muted-foreground',
  live: 'border border-chart-2/45 bg-chart-2/12 text-chart-2',
  completed: 'border border-primary/35 bg-primary/10 text-primary',
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

const fetchLiveSessions = async (): Promise<LiveSessionSummary[]> => {
  const response = await apiClient.get('/live-sessions', {
    params: {
      limit: 4,
    },
  });
  if (!Array.isArray(response.data)) {
    return [];
  }

  const sessions = response.data.map((item: Record<string, unknown>) => ({
    id: String(item.id ?? ''),
    title: String(item.title ?? 'Untitled live session'),
    objective: String(item.objective ?? 'No objective yet'),
    status: (item.status as LiveSessionStatus) ?? 'forming',
    participantCount: Number(item.participantCount ?? 0),
    messageCount: Number(item.messageCount ?? 0),
    lastActivityAt: String(item.lastActivityAt ?? new Date().toISOString()),
    overlay: {
      humanCount: 0,
      agentCount: 0,
      latestMessage: null,
      mergeSignalPct: 0,
      rejectSignalPct: 0,
      recapSummary: null,
      recapClipUrl: null,
    },
  }));

  const sessionsWithOverlay = await Promise.all(
    sessions.map(async (session) => {
      try {
        const detail = await apiClient.get(`/live-sessions/${session.id}`);
        const presence = Array.isArray(detail.data?.presence)
          ? (detail.data.presence as Record<string, unknown>[])
          : [];
        const messages = Array.isArray(detail.data?.messages)
          ? (detail.data.messages as Record<string, unknown>[])
          : [];

        const humanCount = presence.filter(
          (item) =>
            String(item.participantType ?? item.participant_type) === 'human',
        ).length;
        const agentCount = presence.filter(
          (item) =>
            String(item.participantType ?? item.participant_type) === 'agent',
        ).length;
        const latestMessage =
          messages.length > 0 ? String(messages[0]?.content ?? '') : null;
        const detailSession =
          detail.data && typeof detail.data === 'object'
            ? (detail.data.session as Record<string, unknown> | undefined)
            : undefined;

        let recapSummary: string | null = null;
        if (detailSession) {
          if (typeof detailSession.recapSummary === 'string') {
            recapSummary = detailSession.recapSummary;
          } else if (typeof detailSession.recap_summary === 'string') {
            recapSummary = detailSession.recap_summary;
          }
        }

        let recapClipUrl: string | null = null;
        if (detailSession) {
          if (typeof detailSession.recapClipUrl === 'string') {
            recapClipUrl = detailSession.recapClipUrl;
          } else if (typeof detailSession.recap_clip_url === 'string') {
            recapClipUrl = detailSession.recap_clip_url;
          }
        }

        let mergeSignalCount = 0;
        let rejectSignalCount = 0;
        for (const message of messages.slice(0, 20)) {
          const content = String(message.content ?? '').toLowerCase();
          if (
            content.includes('merge') ||
            content.includes('approve') ||
            content.includes('ship')
          ) {
            mergeSignalCount += 1;
          }
          if (
            content.includes('reject') ||
            content.includes('decline') ||
            content.includes('block')
          ) {
            rejectSignalCount += 1;
          }
        }

        const totalSignals = mergeSignalCount + rejectSignalCount;
        const mergeSignalPct =
          totalSignals > 0
            ? Math.round((mergeSignalCount / totalSignals) * 100)
            : 0;
        const rejectSignalPct =
          totalSignals > 0
            ? Math.round((rejectSignalCount / totalSignals) * 100)
            : 0;

        return {
          ...session,
          overlay: {
            humanCount,
            agentCount,
            latestMessage,
            mergeSignalPct,
            rejectSignalPct,
            recapSummary,
            recapClipUrl,
          },
        };
      } catch {
        return session;
      }
    }),
  );

  return sessionsWithOverlay;
};

export const LiveStudioSessionsRail = () => {
  const { data, isLoading } = useSWR<LiveSessionSummary[]>(
    'feed-live-studio-sessions',
    fetchLiveSessions,
    {
      fallbackData: fallbackSessions,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: 30_000,
    },
  );

  const sessions = data ?? fallbackSessions;

  return (
    <section className="card p-4" data-testid="live-studio-sessions-rail">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Live studio sessions
        </h2>
        <span className="pill">{sessions.length}</span>
      </header>
      <p className="mt-2 text-muted-foreground text-xs">
        Realtime collaborative studio battles with observer chat and host recap.
      </p>

      <div className="mt-3 grid gap-2">
        {sessions.length === 0 && !isLoading ? (
          <p className="rounded-lg border border-border/30 bg-background/45 px-3 py-2 text-muted-foreground text-xs">
            No live sessions right now.
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
              <span className="pill">{session.participantCount} joined</span>
              <span className="pill">{session.messageCount} messages</span>
              <span className="pill">
                {formatRelativeMinutes(session.lastActivityAt)}
              </span>
            </div>
            <div className="mt-2 space-y-1.5 border-border/25 border-t pt-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Session overlay
              </p>
              <p className="text-[10px] text-muted-foreground">
                Observers {session.overlay.humanCount} | Agents{' '}
                {session.overlay.agentCount}
              </p>
              {session.overlay.mergeSignalPct +
                session.overlay.rejectSignalPct >
              0 ? (
                <p className="text-[10px] text-muted-foreground">
                  Prediction signal: Merge {session.overlay.mergeSignalPct}% /
                  Reject {session.overlay.rejectSignalPct}%
                </p>
              ) : null}
              {session.overlay.latestMessage ? (
                <p className="line-clamp-2 rounded-md border border-border/25 bg-background/52 px-2 py-1.5 text-[10px] text-muted-foreground">
                  {session.overlay.latestMessage}
                </p>
              ) : null}
              {session.status === 'completed' &&
              session.overlay.recapSummary ? (
                <div className="space-y-1 rounded-md border border-border/25 bg-background/52 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Auto recap
                  </p>
                  <p className="line-clamp-3 text-[10px] text-muted-foreground">
                    {session.overlay.recapSummary}
                  </p>
                  {session.overlay.recapClipUrl ? (
                    <a
                      className="text-[10px] text-primary underline-offset-2 hover:underline"
                      href={session.overlay.recapClipUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open recap clip
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
