import type { ReactNode } from 'react';

type HealthLevel = 'critical' | 'healthy' | 'unknown' | 'watch';

interface MultimodalHourlyTrendItem {
  coverageRate: number | null;
  emptyStates: number;
  errorRate: number | null;
  errors: number;
  hour: string;
  views: number;
}

interface PredictionHourlyTrendItem {
  accuracyRate: number | null;
  hour: string;
  payoutPoints: number;
  payoutToStakeRatio: number | null;
  predictions: number;
  stakePoints: number;
}

interface GatewayCompactionHourlyTrendItem {
  autoCompactionRiskLevel: HealthLevel;
  autoCompactionShare: number | null;
  autoCompactions: number;
  compactions: number;
  hour: string;
  manualCompactions: number;
  prunedEventCount: number;
}

interface ReleaseHealthAlertHourlyTrendItem {
  alerts: number;
  firstAppearances: number;
  hour: string;
}

interface GatewayRiskAboveThresholds {
  criticalAbove: number;
  watchAbove: number;
}

interface GatewayRiskBelowThresholds {
  criticalBelow: number;
  watchBelow: number;
}

interface GatewayTelemetryThresholds {
  autoCompactionShare: GatewayRiskAboveThresholds;
  cooldownSkipRate: GatewayRiskAboveThresholds;
  failedStepRate: GatewayRiskAboveThresholds;
  runtimeSuccessRate: GatewayRiskBelowThresholds;
}

const HOUR_BUCKET_REGEX =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2})(?::\d{2}(?::\d{2})?)?Z?$/;

const toRateText = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatHourBucket = (value: string): string => {
  const match = HOUR_BUCKET_REGEX.exec(value);
  if (!match) {
    return value;
  }
  return `${match[1]} ${match[2]}:00 UTC`;
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

const CompactEmptyState = ({
  message,
  size = 'sm',
}: {
  message: string;
  size?: 'sm' | 'xs';
}) => (
  <div
    className={`rounded-lg border border-border/25 bg-background/55 px-3 py-2 text-muted-foreground ${
      size === 'xs' ? 'text-xs' : 'text-sm'
    }`}
  >
    {message}
  </div>
);

const resolveCardEmptyState = ({
  compactEmptyState,
  itemCount,
}: {
  compactEmptyState: boolean;
  itemCount: number;
}): {
  hasItems: boolean;
  showCompactEmptyState: boolean;
  showPlainEmptyState: boolean;
} => {
  const hasItems = itemCount > 0;
  return {
    hasItems,
    showCompactEmptyState: !hasItems && compactEmptyState,
    showPlainEmptyState: !(hasItems || compactEmptyState),
  };
};

const CardEmptyStateMessage = ({
  emptyLabel,
  showCompactEmptyState,
  showPlainEmptyState,
}: {
  emptyLabel: string;
  showCompactEmptyState: boolean;
  showPlainEmptyState: boolean;
}) => {
  if (showCompactEmptyState) {
    return <CompactEmptyState message={emptyLabel} size="xs" />;
  }
  if (showPlainEmptyState) {
    return <p className="text-muted-foreground text-xs">{emptyLabel}</p>;
  }
  return null;
};

const TableCardShell = ({
  emptyLabel,
  hasItems,
  showCompactEmptyState,
  showPlainEmptyState,
  table,
  title,
}: {
  emptyLabel: string;
  hasItems: boolean;
  showCompactEmptyState: boolean;
  showPlainEmptyState: boolean;
  table: ReactNode;
  title: string;
}) => (
  <article className="card grid gap-2 p-4">
    <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
      {title}
    </h3>
    <CardEmptyStateMessage
      emptyLabel={emptyLabel}
      showCompactEmptyState={showCompactEmptyState}
      showPlainEmptyState={showPlainEmptyState}
    />
    {hasItems ? <div className="overflow-x-auto">{table}</div> : null}
  </article>
);

export const BreakdownListCard = ({
  compactEmptyState = false,
  emptyLabel,
  items,
  title,
}: {
  compactEmptyState?: boolean;
  emptyLabel: string;
  items: Array<{ count: number; key: string }>;
  title: string;
}) => {
  const { hasItems, showCompactEmptyState, showPlainEmptyState } =
    resolveCardEmptyState({
      compactEmptyState,
      itemCount: items.length,
    });
  return (
    <article className="card grid gap-2 p-4">
      <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
        {title}
      </h3>
      <CardEmptyStateMessage
        emptyLabel={emptyLabel}
        showCompactEmptyState={showCompactEmptyState}
        showPlainEmptyState={showPlainEmptyState}
      />
      {hasItems ? (
        <ul className="grid gap-1 text-xs">
          {items.map((entry, index) => (
            <li
              className="flex items-center justify-between gap-2"
              key={`${entry.key}:${index + 1}`}
            >
              <span className="text-muted-foreground">{entry.key}</span>
              <span className="font-semibold text-foreground">
                {entry.count}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
};

export const HourlyTrendCard = ({
  compactEmptyState = false,
  emptyLabel,
  items,
  title,
}: {
  compactEmptyState?: boolean;
  emptyLabel: string;
  items: MultimodalHourlyTrendItem[];
  title: string;
}) => {
  const { hasItems, showCompactEmptyState, showPlainEmptyState } =
    resolveCardEmptyState({
      compactEmptyState,
      itemCount: items.length,
    });
  return (
    <TableCardShell
      emptyLabel={emptyLabel}
      hasItems={hasItems}
      showCompactEmptyState={showCompactEmptyState}
      showPlainEmptyState={showPlainEmptyState}
      table={
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-3">Hour</th>
              <th className="px-3 py-2 text-right">Views</th>
              <th className="px-3 py-2 text-right">Empty</th>
              <th className="px-3 py-2 text-right">Errors</th>
              <th className="px-3 py-2 text-right">Coverage</th>
              <th className="px-3 py-2 text-right">Error rate</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr
                className="border-border/25 border-b last:border-b-0"
                key={entry.hour}
              >
                <td className="py-2 pr-3 text-muted-foreground">
                  {formatHourBucket(entry.hour)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.views}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.emptyStates}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.errors}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {toRateText(entry.coverageRate)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {toRateText(entry.errorRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      title={title}
    />
  );
};

export const ReleaseHealthAlertHourlyTrendCard = ({
  compactEmptyState = false,
  emptyLabel,
  items,
  title,
}: {
  compactEmptyState?: boolean;
  emptyLabel: string;
  items: ReleaseHealthAlertHourlyTrendItem[];
  title: string;
}) => {
  const { hasItems, showCompactEmptyState, showPlainEmptyState } =
    resolveCardEmptyState({
      compactEmptyState,
      itemCount: items.length,
    });
  return (
    <TableCardShell
      emptyLabel={emptyLabel}
      hasItems={hasItems}
      showCompactEmptyState={showCompactEmptyState}
      showPlainEmptyState={showPlainEmptyState}
      table={
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-3">Hour</th>
              <th className="px-3 py-2 text-right">Alerts</th>
              <th className="px-3 py-2 text-right">First appearances</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr
                className="border-border/25 border-b last:border-b-0"
                key={entry.hour}
              >
                <td className="py-2 pr-3 text-muted-foreground">
                  {formatHourBucket(entry.hour)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.alerts}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.firstAppearances}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      title={title}
    />
  );
};

export const PredictionHourlyTrendCard = ({
  compactEmptyState = false,
  emptyLabel,
  items,
  title,
}: {
  compactEmptyState?: boolean;
  emptyLabel: string;
  items: PredictionHourlyTrendItem[];
  title: string;
}) => {
  const { hasItems, showCompactEmptyState, showPlainEmptyState } =
    resolveCardEmptyState({
      compactEmptyState,
      itemCount: items.length,
    });
  return (
    <TableCardShell
      emptyLabel={emptyLabel}
      hasItems={hasItems}
      showCompactEmptyState={showCompactEmptyState}
      showPlainEmptyState={showPlainEmptyState}
      table={
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-3">Hour</th>
              <th className="px-3 py-2 text-right">Predictions</th>
              <th className="px-3 py-2 text-right">Stake</th>
              <th className="px-3 py-2 text-right">Payout</th>
              <th className="px-3 py-2 text-right">Accuracy</th>
              <th className="px-3 py-2 text-right">Payout/Stake</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr
                className="border-border/25 border-b last:border-b-0"
                key={entry.hour}
              >
                <td className="py-2 pr-3 text-muted-foreground">
                  {formatHourBucket(entry.hour)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.predictions}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.stakePoints}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.payoutPoints}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {toRateText(entry.accuracyRate)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {toRateText(entry.payoutToStakeRatio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      title={title}
    />
  );
};

export const GatewayCompactionHourlyTrendCard = ({
  compactEmptyState = false,
  emptyLabel,
  items,
  title,
}: {
  compactEmptyState?: boolean;
  emptyLabel: string;
  items: GatewayCompactionHourlyTrendItem[];
  title: string;
}) => {
  const { hasItems, showCompactEmptyState, showPlainEmptyState } =
    resolveCardEmptyState({
      compactEmptyState,
      itemCount: items.length,
    });
  return (
    <TableCardShell
      emptyLabel={emptyLabel}
      hasItems={hasItems}
      showCompactEmptyState={showCompactEmptyState}
      showPlainEmptyState={showPlainEmptyState}
      table={
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-3">Hour</th>
              <th className="px-3 py-2 text-right">Compactions</th>
              <th className="px-3 py-2 text-right">Auto</th>
              <th className="px-3 py-2 text-right">Manual</th>
              <th className="px-3 py-2 text-right">Auto share</th>
              <th className="px-3 py-2 text-right">Pruned</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr
                className="border-border/25 border-b last:border-b-0"
                key={entry.hour}
              >
                <td className="py-2 pr-3 text-muted-foreground">
                  {formatHourBucket(entry.hour)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.compactions}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.autoCompactions}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.manualCompactions}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  <span
                    className={`${healthBadgeClass(entry.autoCompactionRiskLevel)} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
                  >
                    {toRateText(entry.autoCompactionShare)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {entry.prunedEventCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      title={title}
    />
  );
};

export const GatewayTelemetryThresholdsCard = ({
  thresholds,
}: {
  thresholds: GatewayTelemetryThresholds;
}) => (
  <article className="card grid gap-2 p-4">
    <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
      Telemetry thresholds
    </h3>
    <ul className="grid gap-1 text-xs">
      <li className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Failed step rate</span>
        <span className="text-foreground">
          Watch &gt;= {toRateText(thresholds.failedStepRate.watchAbove)} |
          Critical &gt;= {toRateText(thresholds.failedStepRate.criticalAbove)}
        </span>
      </li>
      <li className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Runtime success rate</span>
        <span className="text-foreground">
          Watch &lt; {toRateText(thresholds.runtimeSuccessRate.watchBelow)} |
          Critical &lt;{' '}
          {toRateText(thresholds.runtimeSuccessRate.criticalBelow)}
        </span>
      </li>
      <li className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Cooldown skip rate</span>
        <span className="text-foreground">
          Watch &gt;= {toRateText(thresholds.cooldownSkipRate.watchAbove)} |
          Critical &gt;= {toRateText(thresholds.cooldownSkipRate.criticalAbove)}
        </span>
      </li>
      <li className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Auto compaction share</span>
        <span className="text-foreground">
          Watch &gt;= {toRateText(thresholds.autoCompactionShare.watchAbove)} |
          Critical &gt;={' '}
          {toRateText(thresholds.autoCompactionShare.criticalAbove)}
        </span>
      </li>
    </ul>
  </article>
);
