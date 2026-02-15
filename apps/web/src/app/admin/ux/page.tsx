interface ObserverEngagementResponse {
  windowHours: number;
  kpis?: {
    observerSessionTimeSec?: number | null;
    sessionCount?: number | null;
    followRate?: number | null;
    digestOpenRate?: number | null;
    return24h?: number | null;
    return7d?: number | null;
    viewModeObserverRate?: number | null;
    viewModeFocusRate?: number | null;
    densityComfortRate?: number | null;
    densityCompactRate?: number | null;
    hintDismissRate?: number | null;
  };
  feedPreferences?: {
    viewMode?: {
      observer?: number;
      focus?: number;
      unknown?: number;
      total?: number;
      observerRate?: number | null;
      focusRate?: number | null;
      unknownRate?: number | null;
    };
    density?: {
      comfort?: number;
      compact?: number;
      unknown?: number;
      total?: number;
      comfortRate?: number | null;
      compactRate?: number | null;
      unknownRate?: number | null;
    };
    hint?: {
      dismissCount?: number;
      switchCount?: number;
      totalInteractions?: number;
      dismissRate?: number | null;
    };
  };
  segments?: Array<{
    mode?: string;
    draftStatus?: string;
    eventType?: string;
    count?: number;
  }>;
}

type HealthLevel = 'critical' | 'healthy' | 'unknown' | 'watch';

const DEFAULT_API_BASE = 'http://localhost:4000/api';
const TRAILING_SLASH_REGEX = /\/$/;

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toRateText = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const resolveHealthLevel = (
  value: unknown,
  thresholds: {
    criticalBelow: number;
    watchBelow: number;
  },
): HealthLevel => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown';
  }
  if (value < thresholds.criticalBelow) {
    return 'critical';
  }
  if (value < thresholds.watchBelow) {
    return 'watch';
  }
  return 'healthy';
};

const healthLabel = (level: HealthLevel): string => {
  if (level === 'healthy') {
    return 'Healthy';
  }
  if (level === 'watch') {
    return 'Watch';
  }
  if (level === 'critical') {
    return 'Critical';
  }
  return 'n/a';
};

const healthBadgeClass = (level: HealthLevel): string => {
  if (level === 'healthy') {
    return 'tag-success';
  }
  if (level === 'watch') {
    return 'tag-hot';
  }
  if (level === 'critical') {
    return 'tag-alert';
  }
  return 'pill';
};

const apiBaseUrl = (): string =>
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE).replace(
    TRAILING_SLASH_REGEX,
    '',
  );

const adminToken = (): string =>
  process.env.ADMIN_API_TOKEN ??
  process.env.NEXT_ADMIN_API_TOKEN ??
  process.env.FINISHIT_ADMIN_API_TOKEN ??
  '';

const fetchObserverEngagement = async (
  hours: number,
): Promise<{
  data: ObserverEngagementResponse | null;
  error: string | null;
}> => {
  const token = adminToken();
  if (!token) {
    return {
      data: null,
      error:
        'Missing admin token. Set ADMIN_API_TOKEN (or NEXT_ADMIN_API_TOKEN) in apps/web environment.',
    };
  }

  const endpoint = `${apiBaseUrl()}/admin/ux/observer-engagement?hours=${hours}`;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'x-admin-token': token,
      },
    });

    if (!response.ok) {
      return {
        data: null,
        error: `Admin API responded with ${response.status}. Check token and api availability.`,
      };
    }

    const payload = (await response.json()) as ObserverEngagementResponse;
    return { data: payload, error: null };
  } catch {
    return {
      data: null,
      error:
        'Unable to reach admin API. Verify NEXT_PUBLIC_API_BASE_URL and api service status.',
    };
  }
};

const StatCard = ({
  label,
  value,
  hint,
}: {
  hint?: string;
  label: string;
  value: string;
}) => (
  <article className="card grid gap-1 p-4">
    <p className="text-muted-foreground text-xs uppercase tracking-wide">
      {label}
    </p>
    <p className="font-semibold text-2xl text-foreground">{value}</p>
    {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
  </article>
);

export default async function AdminUxObserverEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawHours = resolvedSearchParams?.hours;
  const parsedHours =
    typeof rawHours === 'string' ? Number.parseInt(rawHours, 10) : 24;
  const hours = Number.isFinite(parsedHours)
    ? Math.min(Math.max(parsedHours, 1), 720)
    : 24;

  const { data, error } = await fetchObserverEngagement(hours);

  if (error) {
    return (
      <main className="grid gap-4" id="main-content">
        <header className="card p-5">
          <h1 className="font-semibold text-2xl text-foreground">
            Admin UX Metrics
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">{error}</p>
        </header>
      </main>
    );
  }

  const kpis = data?.kpis ?? {};
  const feedPreferences = data?.feedPreferences ?? {};
  const viewMode = feedPreferences.viewMode ?? {};
  const density = feedPreferences.density ?? {};
  const hint = feedPreferences.hint ?? {};
  const segments = Array.isArray(data?.segments) ? data?.segments : [];
  const topSegments = [...segments]
    .sort((left, right) => toNumber(right.count) - toNumber(left.count))
    .slice(0, 8);
  const healthSignals = [
    {
      id: 'return24h',
      label: '24h retention',
      note: 'observer returns within 24 hours',
      value: kpis.return24h,
      thresholds: {
        criticalBelow: 0.1,
        watchBelow: 0.2,
      },
    },
    {
      id: 'followRate',
      label: 'Follow rate',
      note: 'watchlist follow events per viewed draft arc',
      value: kpis.followRate,
      thresholds: {
        criticalBelow: 0.15,
        watchBelow: 0.3,
      },
    },
    {
      id: 'digestOpenRate',
      label: 'Digest open rate',
      note: 'digest_open per watchlist_follow',
      value: kpis.digestOpenRate,
      thresholds: {
        criticalBelow: 0.2,
        watchBelow: 0.35,
      },
    },
    {
      id: 'observerModeShare',
      label: 'Observer mode share',
      note: 'share of view-mode switches into Observer',
      value: kpis.viewModeObserverRate,
      thresholds: {
        criticalBelow: 0.25,
        watchBelow: 0.4,
      },
    },
  ].map((signal) => ({
    ...signal,
    level: resolveHealthLevel(signal.value, signal.thresholds),
  }));

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4" id="main-content">
      <header className="card p-5">
        <h1 className="font-semibold text-2xl text-foreground">
          Admin UX Metrics
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Observer engagement and feed preference telemetry. Window:{' '}
          {toNumber(data?.windowHours, hours)}h
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          hint="Observer sessions in the current window"
          label="Session count"
          value={`${toNumber(kpis.sessionCount)}`}
        />
        <StatCard
          hint="Average observer session duration"
          label="Avg session"
          value={`${toNumber(kpis.observerSessionTimeSec).toFixed(1)}s`}
        />
        <StatCard
          hint="watchlist_follow / draft_arc_view"
          label="Follow rate"
          value={toRateText(kpis.followRate)}
        />
        <StatCard
          hint="digest_open / watchlist_follow"
          label="Digest open rate"
          value={toRateText(kpis.digestOpenRate)}
        />
        <StatCard
          hint="Observer returns from previous 24h window"
          label="24h retention"
          value={toRateText(kpis.return24h)}
        />
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-semibold text-foreground text-lg">
          Engagement health
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {healthSignals.map((signal) => (
            <article
              className="rounded-xl border border-border/55 bg-background/70 p-3"
              key={signal.id}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground text-sm">
                  {signal.label}
                </p>
                <span
                  className={`${healthBadgeClass(signal.level)} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide`}
                >
                  {healthLabel(signal.level)}
                </span>
              </div>
              <p className="mt-2 font-semibold text-base text-foreground">
                {toRateText(signal.value)}
              </p>
              <p className="text-muted-foreground text-xs">{signal.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="font-semibold text-foreground text-lg">
          Feed preference KPIs
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            hint="share of mode switches to Observer"
            label="Observer mode share"
            value={toRateText(kpis.viewModeObserverRate)}
          />
          <StatCard
            hint="share of mode switches to Focus"
            label="Focus mode share"
            value={toRateText(kpis.viewModeFocusRate)}
          />
          <StatCard
            hint="share of density changes to Comfort"
            label="Comfort density share"
            value={toRateText(kpis.densityComfortRate)}
          />
          <StatCard
            hint="share of density changes to Compact"
            label="Compact density share"
            value={toRateText(kpis.densityCompactRate)}
          />
          <StatCard
            hint="hint dismiss / (hint dismiss + hint switch)"
            label="Hint dismiss rate"
            value={toRateText(kpis.hintDismissRate)}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            View mode events
          </h3>
          <p className="text-muted-foreground text-xs">
            observer: {toNumber(viewMode.observer)} | focus:{' '}
            {toNumber(viewMode.focus)} | unknown: {toNumber(viewMode.unknown)} |
            total: {toNumber(viewMode.total)}
          </p>
        </article>

        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Density events
          </h3>
          <p className="text-muted-foreground text-xs">
            comfort: {toNumber(density.comfort)} | compact:{' '}
            {toNumber(density.compact)} | unknown: {toNumber(density.unknown)} |
            total: {toNumber(density.total)}
          </p>
        </article>

        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Hint interactions
          </h3>
          <p className="text-muted-foreground text-xs">
            dismiss: {toNumber(hint.dismissCount)} | switch:{' '}
            {toNumber(hint.switchCount)} | total:{' '}
            {toNumber(hint.totalInteractions)}
          </p>
        </article>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-semibold text-foreground text-lg">Top segments</h2>
        {topSegments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No segment data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-border/55 border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="py-2 pr-3">Mode</th>
                  <th className="px-3 py-2">Draft status</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {topSegments.map((segment, index) => (
                  <tr
                    className="border-border/45 border-b last:border-b-0"
                    key={`${segment.mode ?? 'unknown'}:${segment.eventType ?? 'event'}:${index + 1}`}
                  >
                    <td className="py-2 pr-3 text-foreground">
                      {segment.mode ?? 'unknown'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {segment.draftStatus ?? 'unknown'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {segment.eventType ?? 'unknown'}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {toNumber(segment.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
