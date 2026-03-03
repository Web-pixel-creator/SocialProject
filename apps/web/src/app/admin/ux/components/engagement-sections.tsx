interface EngagementHealthSignalView {
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
  note: string;
  valueText: string;
}

interface TopSegmentView {
  count: number;
  draftStatus: string;
  eventType: string;
  key: string;
  mode: string;
}

interface FeedEventModeTotals {
  focus: number;
  observer: number;
  total: number;
  unknown: number;
}

interface FeedEventDensityTotals {
  comfort: number;
  compact: number;
  total: number;
  unknown: number;
}

interface FeedEventHintTotals {
  dismissCount: number;
  switchCount: number;
  total: number;
}

const CompactEmptyState = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-border/25 bg-background/55 px-3 py-2 text-muted-foreground text-sm">
    {message}
  </div>
);

export const EngagementOverviewSection = ({
  digestOpenRateText,
  engagementAvgSessionSeconds,
  engagementSessionCount,
  followRateText,
  isVisible,
  return24hRateText,
  shouldCompact,
}: {
  digestOpenRateText: string;
  engagementAvgSessionSeconds: number;
  engagementSessionCount: number;
  followRateText: string;
  isVisible: boolean;
  return24hRateText: string;
  shouldCompact: boolean;
}) => {
  if (!isVisible) {
    return null;
  }
  if (shouldCompact) {
    return (
      <section className="card grid gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground text-lg">
            Engagement overview
          </h2>
          <span className="inline-flex items-center rounded-full border border-border/45 bg-background/45 px-2 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            low signal
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          No observer session activity in the selected window yet. Expanded KPI
          cards appear automatically after first session events.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/25 bg-background/55 px-3 py-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Sessions
            </p>
            <p className="font-semibold text-foreground text-sm">
              {engagementSessionCount}
            </p>
          </div>
          <div className="rounded-lg border border-border/25 bg-background/55 px-3 py-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Avg session
            </p>
            <p className="font-semibold text-foreground text-sm">
              {engagementAvgSessionSeconds.toFixed(1)}s
            </p>
          </div>
          <div className="rounded-lg border border-border/25 bg-background/55 px-3 py-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Returns / follows
            </p>
            <p className="font-semibold text-foreground text-sm">
              {return24hRateText} / {followRateText}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <article className="card grid gap-1 p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Session count
        </p>
        <p className="font-semibold text-foreground text-xl sm:text-2xl">
          {engagementSessionCount}
        </p>
        <p className="text-muted-foreground text-xs">
          Observer sessions in the current window
        </p>
      </article>
      <article className="card grid gap-1 p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Avg session
        </p>
        <p className="font-semibold text-foreground text-xl sm:text-2xl">
          {engagementAvgSessionSeconds.toFixed(1)}s
        </p>
        <p className="text-muted-foreground text-xs">
          Average observer session duration
        </p>
      </article>
      <article className="card grid gap-1 p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Follow rate
        </p>
        <p className="font-semibold text-foreground text-xl sm:text-2xl">
          {followRateText}
        </p>
        <p className="text-muted-foreground text-xs">
          watchlist_follow / draft_arc_view
        </p>
      </article>
      <article className="card grid gap-1 p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Digest open rate
        </p>
        <p className="font-semibold text-foreground text-xl sm:text-2xl">
          {digestOpenRateText}
        </p>
        <p className="text-muted-foreground text-xs">
          digest_open / watchlist_follow
        </p>
      </article>
      <article className="card grid gap-1 p-4">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          24h retention
        </p>
        <p className="font-semibold text-foreground text-xl sm:text-2xl">
          {return24hRateText}
        </p>
        <p className="text-muted-foreground text-xs">
          Observer returns from previous 24h window
        </p>
      </article>
    </section>
  );
};

export const EngagementHealthSection = ({
  isVisible,
  signals,
}: {
  isVisible: boolean;
  signals: EngagementHealthSignalView[];
}) => {
  if (!isVisible) {
    return null;
  }
  return (
    <section className="card grid gap-3 p-4 sm:p-5">
      <h2 className="font-semibold text-foreground text-lg">
        Engagement health
      </h2>
      {signals.length === 0 ? (
        <CompactEmptyState message="Waiting for enough engagement telemetry to score health signals." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {signals.map((signal) => (
            <article
              className="rounded-xl border border-border/25 bg-background/60 p-3"
              key={signal.id}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground text-sm">
                  {signal.label}
                </p>
                <span
                  className={`${signal.badgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
                >
                  {signal.badgeLabel}
                </span>
              </div>
              <p className="mt-2 font-semibold text-base text-foreground">
                {signal.valueText}
              </p>
              <p className="text-muted-foreground text-xs">{signal.note}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export const FeedPreferenceKpisSection = ({
  compactDensityShareText,
  comfortDensityShareText,
  hintDismissRateText,
  isVisible,
  legacyFocusShareText,
  observerModeShareText,
  shouldCompact,
}: {
  compactDensityShareText: string;
  comfortDensityShareText: string;
  hintDismissRateText: string;
  isVisible: boolean;
  legacyFocusShareText: string;
  observerModeShareText: string;
  shouldCompact: boolean;
}) => {
  if (!isVisible) {
    return null;
  }
  return (
    <section className="card grid gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground text-lg">
          Feed preference KPIs
        </h2>
        {shouldCompact ? (
          <span className="inline-flex items-center rounded-full border border-border/45 bg-background/45 px-2 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            low signal
          </span>
        ) : null}
      </div>
      {shouldCompact ? (
        <CompactEmptyState message="No preference interaction events yet. Expanded KPI cards appear after mode/density/hint telemetry arrives." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="card grid gap-1 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Observer mode share
            </p>
            <p className="font-semibold text-foreground text-xl sm:text-2xl">
              {observerModeShareText}
            </p>
            <p className="text-muted-foreground text-xs">
              share of mode switches to Observer
            </p>
          </article>
          <article className="card grid gap-1 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Legacy focus share
            </p>
            <p className="font-semibold text-foreground text-xl sm:text-2xl">
              {legacyFocusShareText}
            </p>
            <p className="text-muted-foreground text-xs">
              historical share from legacy Focus mode
            </p>
          </article>
          <article className="card grid gap-1 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Comfort density share
            </p>
            <p className="font-semibold text-foreground text-xl sm:text-2xl">
              {comfortDensityShareText}
            </p>
            <p className="text-muted-foreground text-xs">
              share of density changes to Comfort
            </p>
          </article>
          <article className="card grid gap-1 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Compact density share
            </p>
            <p className="font-semibold text-foreground text-xl sm:text-2xl">
              {compactDensityShareText}
            </p>
            <p className="text-muted-foreground text-xs">
              share of density changes to Compact
            </p>
          </article>
          <article className="card grid gap-1 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Hint dismiss rate
            </p>
            <p className="font-semibold text-foreground text-xl sm:text-2xl">
              {hintDismissRateText}
            </p>
            <p className="text-muted-foreground text-xs">
              hint dismiss / (hint dismiss + hint switch)
            </p>
          </article>
        </div>
      )}
    </section>
  );
};

export const FeedInteractionCountersSection = ({
  density,
  hint,
  isVisible,
  shouldCompact,
  viewMode,
}: {
  density: FeedEventDensityTotals;
  hint: FeedEventHintTotals;
  isVisible: boolean;
  shouldCompact: boolean;
  viewMode: FeedEventModeTotals;
}) => {
  if (!isVisible) {
    return null;
  }
  if (shouldCompact) {
    return (
      <section className="card grid gap-3 p-4 sm:p-5">
        <h2 className="font-semibold text-foreground text-lg">
          Feed interaction counters
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/25 bg-background/55 px-3 py-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Mode switches
            </p>
            <p className="font-semibold text-foreground text-sm">
              {viewMode.total}
            </p>
          </div>
          <div className="rounded-lg border border-border/25 bg-background/55 px-3 py-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Density switches
            </p>
            <p className="font-semibold text-foreground text-sm">
              {density.total}
            </p>
          </div>
          <div className="rounded-lg border border-border/25 bg-background/55 px-3 py-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Hint interactions
            </p>
            <p className="font-semibold text-foreground text-sm">
              {hint.total}
            </p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <article className="card grid gap-2 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Observer mode events
        </h3>
        <p className="text-muted-foreground text-xs">
          observer: {viewMode.observer} | legacy focus: {viewMode.focus} |
          unknown: {viewMode.unknown} | total: {viewMode.total}
        </p>
      </article>
      <article className="card grid gap-2 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Density events
        </h3>
        <p className="text-muted-foreground text-xs">
          comfort: {density.comfort} | compact: {density.compact} | unknown:{' '}
          {density.unknown} | total: {density.total}
        </p>
      </article>
      <article className="card grid gap-2 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Hint interactions
        </h3>
        <p className="text-muted-foreground text-xs">
          dismiss: {hint.dismissCount} | switch: {hint.switchCount} | total:{' '}
          {hint.total}
        </p>
      </article>
    </section>
  );
};

export const TopSegmentsSection = ({
  isVisible,
  shouldCompactFeedPreferenceEvents,
  topSegments,
}: {
  isVisible: boolean;
  shouldCompactFeedPreferenceEvents: boolean;
  topSegments: TopSegmentView[];
}) => {
  if (!isVisible) {
    return null;
  }
  return (
    <section className="card grid gap-3 p-4 sm:p-5">
      <h2 className="font-semibold text-foreground text-lg">Top segments</h2>
      {topSegments.length === 0 && shouldCompactFeedPreferenceEvents ? (
        <CompactEmptyState message="No segment ranking yet. Segment table appears after observer interaction events are collected." />
      ) : null}
      {topSegments.length === 0 && !shouldCompactFeedPreferenceEvents ? (
        <CompactEmptyState message="No segment data yet." />
      ) : null}
      {topSegments.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-border/25 border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="py-2 pr-3">Mode</th>
                <th className="px-3 py-2">Draft status</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {topSegments.map((segment) => (
                <tr
                  className="border-border/25 border-b last:border-b-0"
                  key={segment.key}
                >
                  <td className="py-2 pr-3 text-foreground">{segment.mode}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {segment.draftStatus}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {segment.eventType}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {segment.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
};
