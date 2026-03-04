import type { ReactNode } from 'react';

interface PredictionStatCard {
  hint: string;
  label: string;
  value: string;
}

interface PredictionResolutionWindowView {
  accuracyText: string;
  correctPredictions: number;
  days: number;
  netPoints: number;
  predictors: number;
  resolvedPredictions: number;
  riskBadgeClassName: string;
  riskLabel: string;
}

interface PredictionOutcomeCohortRow {
  accuracyRateText: string;
  netPoints: number;
  predictedOutcomeLabel: string;
  predictions: number;
  resolvedPredictions: number;
  riskBadgeClassName: string;
  riskLabel: string;
  settlementRateText: string;
}

interface PredictionStakeBandCohortRow {
  accuracyRateText: string;
  netPoints: number;
  predictions: number;
  resolvedPredictions: number;
  riskBadgeClassName: string;
  riskLabel: string;
  settlementRateText: string;
  stakeBand: string;
}

interface PredictionScopeFilterRow {
  count: number;
  filter: string;
  scope: string;
}

interface PredictionScopeSortRow {
  count: number;
  scope: string;
  sort: string;
}

interface PredictionHistoryScopeRow {
  activeFilter: string | null;
  activeSort: string | null;
  lastChangedAt: string | null;
  scope: string;
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

const CompactEmptyState = ({ message }: { message: string }) => (
  <p className="rounded-xl border border-border/35 bg-background/55 px-3 py-2 text-muted-foreground text-xs">
    {message}
  </p>
);

export const PredictionMarketSection = ({
  accuracyBadgeClassName,
  accuracyLabel,
  averageStakeText,
  cohortThresholdSummary,
  cohortsByOutcomeRows,
  cohortsByStakeBandRows,
  correctPredictions,
  filterScopeMixCard,
  filterSwitchShareText,
  filterSwitchesValue,
  filterValueMixCard,
  historyScopeRows,
  hourlyTrendCard,
  nonDefaultSortShareText,
  outcomeMixCard,
  participationRateText,
  predictionStatCards,
  resolvedPredictions,
  scopeFilterMatrixRows,
  scopeSortMatrixRows,
  sortScopeMixCard,
  sortSwitchShareText,
  sortSwitchesValue,
  sortValueMixCard,
  window30d,
  window7d,
  windowThresholdCriticalText,
  windowThresholdWatchText,
  windowThresholdMinSample,
}: {
  accuracyBadgeClassName: string;
  accuracyLabel: string;
  averageStakeText: string;
  cohortThresholdSummary: string;
  cohortsByOutcomeRows: PredictionOutcomeCohortRow[];
  cohortsByStakeBandRows: PredictionStakeBandCohortRow[];
  correctPredictions: number;
  filterScopeMixCard: ReactNode;
  filterSwitchShareText: string;
  filterSwitchesValue: string;
  filterValueMixCard: ReactNode;
  historyScopeRows: PredictionHistoryScopeRow[];
  hourlyTrendCard: ReactNode;
  nonDefaultSortShareText: string;
  outcomeMixCard: ReactNode;
  participationRateText: string;
  predictionStatCards: PredictionStatCard[];
  resolvedPredictions: number;
  scopeFilterMatrixRows: PredictionScopeFilterRow[];
  scopeSortMatrixRows: PredictionScopeSortRow[];
  sortScopeMixCard: ReactNode;
  sortSwitchShareText: string;
  sortSwitchesValue: string;
  sortValueMixCard: ReactNode;
  window30d: PredictionResolutionWindowView;
  window7d: PredictionResolutionWindowView;
  windowThresholdCriticalText: string;
  windowThresholdWatchText: string;
  windowThresholdMinSample: number;
}) => (
  <section className="card grid gap-4 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold text-foreground text-lg">
        Prediction market telemetry
      </h2>
      <span
        className={`${accuracyBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
      >
        Accuracy risk: {accuracyLabel}
      </span>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {predictionStatCards.map((card) => (
        <StatCard
          hint={card.hint}
          key={card.label}
          label={card.label}
          value={card.value}
        />
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      {outcomeMixCard}
      <article className="card grid gap-2 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Participation snapshot
        </h3>
        <p className="text-muted-foreground text-xs">
          Participation rate:{' '}
          <span className="font-semibold text-foreground">
            {participationRateText}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          Average stake:{' '}
          <span className="font-semibold text-foreground">
            {averageStakeText}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          Resolved:{' '}
          <span className="font-semibold text-foreground">
            {resolvedPredictions}
          </span>{' '}
          | Correct:{' '}
          <span className="font-semibold text-foreground">
            {correctPredictions}
          </span>
        </p>
      </article>
      <article className="card grid gap-2 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Resolved windows
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${window7d.riskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
          >
            7d risk: {window7d.riskLabel}
          </span>
          <span
            className={`${window30d.riskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
          >
            30d risk: {window30d.riskLabel}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Thresholds: watch &lt; {windowThresholdWatchText} | critical &lt;{' '}
          {windowThresholdCriticalText} | min sample: {windowThresholdMinSample}
        </p>
        <p className="text-muted-foreground text-xs">
          {window7d.days}d:{' '}
          <span className="font-semibold text-foreground">
            {window7d.accuracyText}
          </span>{' '}
          ({window7d.correctPredictions}/{window7d.resolvedPredictions}) | Net:{' '}
          <span className="font-semibold text-foreground">
            {window7d.netPoints >= 0 ? '+' : ''}
            {window7d.netPoints}
          </span>{' '}
          | Predictors:{' '}
          <span className="font-semibold text-foreground">
            {window7d.predictors}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          {window30d.days}d:{' '}
          <span className="font-semibold text-foreground">
            {window30d.accuracyText}
          </span>{' '}
          ({window30d.correctPredictions}/{window30d.resolvedPredictions}) |
          Net:{' '}
          <span className="font-semibold text-foreground">
            {window30d.netPoints >= 0 ? '+' : ''}
            {window30d.netPoints}
          </span>{' '}
          | Predictors:{' '}
          <span className="font-semibold text-foreground">
            {window30d.predictors}
          </span>
        </p>
      </article>
    </div>
    <details className="rounded-xl border border-border/30 bg-background/45 p-3">
      <summary className="cursor-pointer font-semibold text-foreground text-xs uppercase tracking-wide">
        Advanced prediction telemetry
      </summary>
      <div className="mt-3 grid gap-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <StatCard
            hint="observer prediction-history filter changes"
            label="Filter switches"
            value={filterSwitchesValue}
          />
          {filterScopeMixCard}
          {filterValueMixCard}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="card grid gap-2 p-4">
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
              Resolution cohorts by outcome
            </h3>
            <p className="text-muted-foreground text-xs">
              Cohort thresholds: {cohortThresholdSummary}
            </p>
            {cohortsByOutcomeRows.length === 0 ? (
              <CompactEmptyState message="No outcome cohort data in current window." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                      <th className="py-2 pr-3">Outcome</th>
                      <th className="px-3 py-2 text-right">Predictions</th>
                      <th className="px-3 py-2 text-right">Settled</th>
                      <th className="px-3 py-2 text-right">Settlement</th>
                      <th className="px-3 py-2 text-right">Accuracy</th>
                      <th className="px-3 py-2 text-right">Risk</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortsByOutcomeRows.map((entry, index) => (
                      <tr
                        className="border-border/25 border-b last:border-b-0"
                        key={`${entry.predictedOutcomeLabel}:${index + 1}`}
                      >
                        <td className="py-2 pr-3 text-muted-foreground">
                          {entry.predictedOutcomeLabel}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          {entry.predictions}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {entry.resolvedPredictions}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {entry.settlementRateText}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {entry.accuracyRateText}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`${entry.riskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
                          >
                            {entry.riskLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground">
                          {entry.netPoints >= 0 ? '+' : ''}
                          {entry.netPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
          <article className="card grid gap-2 p-4">
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
              Resolution cohorts by stake band
            </h3>
            <p className="text-muted-foreground text-xs">
              Cohort thresholds: {cohortThresholdSummary}
            </p>
            {cohortsByStakeBandRows.length === 0 ? (
              <CompactEmptyState message="No stake-band cohort data in current window." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                      <th className="py-2 pr-3">Stake band</th>
                      <th className="px-3 py-2 text-right">Predictions</th>
                      <th className="px-3 py-2 text-right">Settled</th>
                      <th className="px-3 py-2 text-right">Settlement</th>
                      <th className="px-3 py-2 text-right">Accuracy</th>
                      <th className="px-3 py-2 text-right">Risk</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortsByStakeBandRows.map((entry, index) => (
                      <tr
                        className="border-border/25 border-b last:border-b-0"
                        key={`${entry.stakeBand}:${index + 1}`}
                      >
                        <td className="py-2 pr-3 text-muted-foreground">
                          {entry.stakeBand}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          {entry.predictions}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {entry.resolvedPredictions}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {entry.settlementRateText}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {entry.accuracyRateText}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`${entry.riskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
                          >
                            {entry.riskLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground">
                          {entry.netPoints >= 0 ? '+' : ''}
                          {entry.netPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Scope x filter matrix
          </h3>
          {scopeFilterMatrixRows.length === 0 ? (
            <CompactEmptyState message="No scope/filter matrix data in current window." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 pr-3">Scope</th>
                    <th className="px-3 py-2">Filter</th>
                    <th className="px-3 py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeFilterMatrixRows.map((entry, index) => (
                    <tr
                      className="border-border/25 border-b last:border-b-0"
                      key={`${entry.scope}:${entry.filter}:${index + 1}`}
                    >
                      <td className="py-2 pr-3 text-muted-foreground">
                        {entry.scope}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {entry.filter}
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
        <div className="grid gap-4 lg:grid-cols-3">
          <StatCard
            hint="observer prediction-history sort changes"
            label="Sort switches"
            value={sortSwitchesValue}
          />
          {sortScopeMixCard}
          {sortValueMixCard}
        </div>
        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Scope x sort matrix
          </h3>
          {scopeSortMatrixRows.length === 0 ? (
            <CompactEmptyState message="No scope/sort matrix data in current window." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 pr-3">Scope</th>
                    <th className="px-3 py-2">Sort</th>
                    <th className="px-3 py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeSortMatrixRows.map((entry, index) => (
                    <tr
                      className="border-border/25 border-b last:border-b-0"
                      key={`${entry.scope}:${entry.sort}:${index + 1}`}
                    >
                      <td className="py-2 pr-3 text-muted-foreground">
                        {entry.scope}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {entry.sort}
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
        <article className="card grid gap-2 p-4">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Active prediction controls by scope
          </h3>
          {historyScopeRows.length === 0 ? (
            <CompactEmptyState message="No active prediction-history control state in current window." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 pr-3">Scope</th>
                    <th className="px-3 py-2">Active filter</th>
                    <th className="px-3 py-2">Active sort</th>
                    <th className="px-3 py-2 text-right">Last changed (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {historyScopeRows.map((entry, index) => (
                    <tr
                      className="border-border/25 border-b last:border-b-0"
                      key={`${entry.scope}:${index + 1}`}
                    >
                      <td className="py-2 pr-3 text-muted-foreground">
                        {entry.scope}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {entry.activeFilter ?? 'n/a'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {entry.activeSort ?? 'n/a'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-foreground">
                        {entry.lastChangedAt ?? 'n/a'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard
            hint="filter switches / (filter + sort switches)"
            label="Filter switch share"
            value={filterSwitchShareText}
          />
          <StatCard
            hint="sort switches / (filter + sort switches)"
            label="Sort switch share"
            value={sortSwitchShareText}
          />
          <StatCard
            hint="non-recency sort switches / all sort switches"
            label="Non-default sort share"
            value={nonDefaultSortShareText}
          />
        </div>
      </div>
    </details>
    {hourlyTrendCard}
  </section>
);
