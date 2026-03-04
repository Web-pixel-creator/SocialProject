export interface StyleFusionCopyMetricsView {
  errorBreakdown: Array<{
    count: number;
    errorCode: string;
  }>;
  errors: number;
  success: number;
  successRate: number | null;
  total: number;
}

export interface StyleFusionMetricsView {
  avgSampleCount: number | null;
  copy: StyleFusionCopyMetricsView;
  errorBreakdown: Array<{
    count: number;
    errorCode: string;
  }>;
  errors: number;
  success: number;
  successRate: number | null;
  total: number;
}

const toRateText = (value: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const toAvgSampleCountText = (value: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return value.toFixed(2);
};

const StatCard = ({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: string;
}) => {
  const normalizedValue = value.trim().toLowerCase();
  const isNaValue = normalizedValue === 'n/a' || normalizedValue === 'na';
  return (
    <article className="card grid gap-1 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p
        className={
          isNaValue
            ? 'font-medium text-base text-muted-foreground'
            : 'font-semibold text-foreground text-xl sm:text-2xl'
        }
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </article>
  );
};

const CompactEmptyState = ({ message }: { message: string }) => (
  <p className="rounded-xl border border-border/35 bg-background/55 px-3 py-2 text-muted-foreground text-xs">
    {message}
  </p>
);

export const StyleFusionMetricsSection = ({
  copyRiskBadgeClassName,
  copyRiskLabel,
  fusionRiskBadgeClassName,
  fusionRiskLabel,
  metrics,
}: {
  copyRiskBadgeClassName: string;
  copyRiskLabel: string;
  fusionRiskBadgeClassName: string;
  fusionRiskLabel: string;
  metrics: StyleFusionMetricsView;
}) => (
  <section className="card grid gap-4 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold text-foreground text-lg">
        Style fusion metrics
      </h2>
      <span
        className={`${fusionRiskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
      >
        Fusion risk: {fusionRiskLabel}
      </span>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        hint="Total style-fusion generation attempts"
        label="Fusion attempts"
        value={`${metrics.total}`}
      />
      <StatCard
        hint="Successful style-fusion generations"
        label="Fusion success"
        value={`${metrics.success}`}
      />
      <StatCard
        hint="Success share in current window"
        label="Fusion success rate"
        value={toRateText(metrics.successRate)}
      />
      <StatCard
        hint="Average sample drafts used in successful fusion"
        label="Avg sample count"
        value={toAvgSampleCountText(metrics.avgSampleCount)}
      />
    </div>
    <details className="rounded-xl border border-border/30 bg-background/45 p-3">
      <summary className="cursor-pointer font-semibold text-foreground text-xs uppercase tracking-wide">
        Advanced style fusion diagnostics
      </summary>
      <div className="mt-3 grid gap-4">
        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Fusion errors
          </h3>
          {metrics.errorBreakdown.length === 0 ? (
            <CompactEmptyState message="No style-fusion errors in current window." />
          ) : (
            <ul className="grid gap-1 text-xs">
              {metrics.errorBreakdown.map((entry, index) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={`${entry.errorCode}:${index + 1}`}
                >
                  <span className="text-muted-foreground">
                    {entry.errorCode}
                  </span>
                  <span className="font-semibold text-foreground">
                    {entry.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="card grid gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
              Fusion brief copy
            </h3>
            <span
              className={`${copyRiskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
            >
              Copy risk: {copyRiskLabel}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              hint="Copy fusion brief attempts from draft detail"
              label="Copy attempts"
              value={`${metrics.copy.total}`}
            />
            <StatCard
              hint="Successful clipboard writes for fusion brief"
              label="Copy success rate"
              value={toRateText(metrics.copy.successRate)}
            />
            <StatCard
              hint="Failed copy attempts in current window"
              label="Copy errors"
              value={`${metrics.copy.errors}`}
            />
          </div>
          <article className="card grid gap-2 p-4">
            <h4 className="font-semibold text-foreground text-sm uppercase tracking-wide">
              Copy errors
            </h4>
            {metrics.copy.errorBreakdown.length === 0 ? (
              <CompactEmptyState message="No fusion-brief copy errors in current window." />
            ) : (
              <ul className="grid gap-1 text-xs">
                {metrics.copy.errorBreakdown.map((entry, index) => (
                  <li
                    className="flex items-center justify-between gap-2"
                    key={`${entry.errorCode}:${index + 1}`}
                  >
                    <span className="text-muted-foreground">
                      {entry.errorCode}
                    </span>
                    <span className="font-semibold text-foreground">
                      {entry.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </article>
      </div>
    </details>
  </section>
);
