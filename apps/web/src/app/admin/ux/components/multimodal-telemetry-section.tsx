import type { ReactNode } from 'react';

interface MultimodalStatCard {
  hint: string;
  label: string;
  value: string;
}

interface MultimodalBreakdownRow {
  category: string;
  count: number;
  key: string;
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

export const MultimodalTelemetrySection = ({
  breakdownRows,
  coverageRiskBadgeClassName,
  coverageRiskLabel,
  hourlyTrendCard,
  invalidQueryErrorsValue,
  invalidQueryShareText,
  multimodalStatCards,
}: {
  breakdownRows: MultimodalBreakdownRow[];
  coverageRiskBadgeClassName: string;
  coverageRiskLabel: string;
  hourlyTrendCard: ReactNode;
  invalidQueryErrorsValue: string;
  invalidQueryShareText: string;
  multimodalStatCards: MultimodalStatCard[];
}) => (
  <section className="card grid gap-4 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold text-foreground text-lg">
        Multimodal GlowUp telemetry
      </h2>
      <span
        className={`${coverageRiskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
      >
        Coverage risk: {coverageRiskLabel}
      </span>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {multimodalStatCards.map((card) => (
        <StatCard
          hint={card.hint}
          key={card.label}
          label={card.label}
          value={card.value}
        />
      ))}
    </div>
    {hourlyTrendCard}
    <details className="rounded-xl border border-border/30 bg-background/45 p-3">
      <summary className="cursor-pointer font-semibold text-foreground text-xs uppercase tracking-wide">
        Advanced multimodal diagnostics
      </summary>
      <div className="mt-3 grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            hint="query validation rejects for multimodal read requests"
            label="Invalid query errors"
            value={invalidQueryErrorsValue}
          />
          <StatCard
            hint="invalid-query errors / all multimodal error signals"
            label="Invalid query share"
            value={invalidQueryShareText}
          />
        </div>
        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Multimodal breakdown
          </h3>
          {breakdownRows.length === 0 ? (
            <p className="rounded-xl border border-border/35 bg-background/55 px-3 py-2 text-muted-foreground text-xs">
              No provider/empty/error breakdown data in current window.
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
      </div>
    </details>
  </section>
);
