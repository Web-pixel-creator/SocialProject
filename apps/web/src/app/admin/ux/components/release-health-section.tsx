import type { ReactNode } from 'react';

interface ReleaseBreakdownRow {
  category: string;
  count: number;
  key: string;
}

interface ReleaseSavedViewLink {
  description: string;
  href: string;
  label: string;
}

interface ReleaseIncidentMetric {
  label: string;
  value: string;
}

interface ReleaseLatestIncidentCard {
  badgeClassName: string;
  badgeLabel: string;
  debugHref: string;
  metrics: ReleaseIncidentMetric[];
  qualityHref: string;
  runHref: string | null;
  summary: string;
  title: string;
}

const StatCard = ({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: string;
}) => (
  <article className="card grid gap-1 p-4">
    <p className="text-muted-foreground text-xs uppercase tracking-wide">
      {label}
    </p>
    <p className="font-semibold text-foreground text-xl sm:text-2xl">{value}</p>
    {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
  </article>
);

const isNaLikeValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'n/a' || normalized === 'na';
};

export const ReleaseHealthSection = ({
  breakdownRows,
  hourlyTrendCard,
  latestIncidentCard,
  releaseAlertsCount,
  releaseFirstAppearancesCount,
  releaseLatestReceivedAt,
  releaseLatestRunLabel,
  releaseLatestRunUrl,
  releaseRiskBadgeClassName,
  releaseRiskLabel,
  releaseRunsCount,
  savedViewLinks,
}: {
  breakdownRows: ReleaseBreakdownRow[];
  hourlyTrendCard: ReactNode;
  latestIncidentCard: ReleaseLatestIncidentCard | null;
  releaseAlertsCount: string;
  releaseFirstAppearancesCount: string;
  releaseLatestReceivedAt: string | null;
  releaseLatestRunLabel: string;
  releaseLatestRunUrl: string | null;
  releaseRiskBadgeClassName: string;
  releaseRiskLabel: string;
  releaseRunsCount: string;
  savedViewLinks: ReleaseSavedViewLink[];
}) => {
  const visibleStatCards = [
    {
      hint: 'release-health webhook events in current window',
      label: 'Alert events',
      value: releaseAlertsCount,
    },
    {
      hint: 'sum of first-appearance entries across alert events',
      label: 'First appearances',
      value: releaseFirstAppearancesCount,
    },
    {
      hint: 'unique launch-gate run ids represented in alert events',
      label: 'Alerted runs',
      value: releaseRunsCount,
    },
    {
      hint: 'latest run that generated a release-health alert event',
      label: 'Latest alerted run',
      value: releaseLatestRunLabel,
    },
  ].filter((card) => !isNaLikeValue(card.value));

  return (
    <section className="card grid gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground text-lg">
          Release health alert telemetry
        </h2>
        <span
          className={`${releaseRiskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
        >
          Alert risk: {releaseRiskLabel}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-border/25 bg-background/60 p-3">
          <p className="font-semibold text-foreground text-sm">Alert risk</p>
          <p className="mt-2 font-semibold text-base text-foreground">
            {releaseRiskLabel}
          </p>
          <p className="text-muted-foreground text-xs">
            Critical at first appearances &gt;= 3, alert events &gt;= 3, or
            alerted runs &gt;= 2.
          </p>
        </article>
        {visibleStatCards.map((card) => (
          <StatCard
            hint={card.hint}
            key={card.label}
            label={card.label}
            value={card.value}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Latest received:{' '}
        <span className="font-semibold text-foreground">
          {releaseLatestReceivedAt ?? 'n/a'}
        </span>
        {' | '}Run URL:{' '}
        {typeof releaseLatestRunUrl === 'string' &&
        releaseLatestRunUrl.length > 0 ? (
          <a
            className="font-semibold text-foreground underline-offset-2 hover:underline"
            href={releaseLatestRunUrl}
          >
            {releaseLatestRunUrl}
          </a>
        ) : (
          <span className="font-semibold text-foreground">n/a</span>
        )}
      </p>
      <article className="card grid gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Operator saved views
          </h3>
          <span className="inline-flex items-center rounded-full border border-border/45 bg-background/45 px-2 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            shortcuts
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {savedViewLinks.map((view) => (
            <a
              className="rounded-xl border border-border/30 bg-background/55 p-3 transition-colors hover:border-primary/45 hover:text-foreground"
              href={view.href}
              key={view.label}
            >
              <p className="font-semibold text-foreground text-sm">
                {view.label}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {view.description}
              </p>
            </a>
          ))}
        </div>
      </article>
      {latestIncidentCard ? (
        <article className="card grid gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="grid gap-1">
              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
                {latestIncidentCard.title}
              </h3>
              <p className="text-muted-foreground text-sm">
                {latestIncidentCard.summary}
              </p>
            </div>
            <span
              className={`${latestIncidentCard.badgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
            >
              {latestIncidentCard.badgeLabel}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {latestIncidentCard.metrics.map((metric) => (
              <StatCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {latestIncidentCard.runHref ? (
              <a
                className="inline-flex items-center rounded-full border border-border/45 bg-background/45 px-3 py-1 font-semibold text-xs transition-colors hover:border-primary/45 hover:text-foreground"
                href={latestIncidentCard.runHref}
              >
                Open GitHub run
              </a>
            ) : null}
            <a
              className="inline-flex items-center rounded-full border border-primary/45 bg-primary/10 px-3 py-1 font-semibold text-primary text-xs transition-colors hover:bg-primary/15"
              href={latestIncidentCard.debugHref}
            >
              Open filtered debug view
            </a>
            <a
              className="inline-flex items-center rounded-full border border-border/45 bg-background/45 px-3 py-1 font-semibold text-xs transition-colors hover:border-primary/45 hover:text-foreground"
              href={latestIncidentCard.qualityHref}
            >
              Open quality risk view
            </a>
          </div>
        </article>
      ) : null}
      <article className="card grid gap-2 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Alert breakdowns
        </h3>
        {breakdownRows.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No alert channel or failure-mode distribution in current window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 pr-3">Category</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {breakdownRows.map((entry, index) => (
                  <tr
                    className="border-border/25 border-b last:border-b-0"
                    key={`${entry.category}:${entry.key}:${index + 1}`}
                  >
                    <td className="py-2 pr-3 text-muted-foreground">
                      {entry.category}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.key}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {entry.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
      {hourlyTrendCard}
    </section>
  );
};
