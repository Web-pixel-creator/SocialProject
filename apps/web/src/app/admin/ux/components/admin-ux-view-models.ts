type HealthLevel = 'critical' | 'healthy' | 'unknown' | 'watch';

interface EngagementKpisInput {
  digestOpenRate?: number | null;
  followRate?: number | null;
  predictionNonDefaultSortRate?: number | null;
  predictionSortSwitchShare?: number | null;
  return24h?: number | null;
  viewModeObserverRate?: number | null;
}

interface HealthThresholds {
  criticalBelow: number;
  watchBelow: number;
}

interface PanelTabInput<T extends string> {
  id: T;
  label: string;
}

interface SegmentInput {
  count?: number | null;
  draftStatus?: string;
  eventType?: string;
  mode?: string;
}

export const buildTopSegmentsView = ({
  segments,
  toNumber,
}: {
  segments: SegmentInput[];
  toNumber: (value: unknown, fallback?: number) => number;
}): Array<{
  count: number;
  draftStatus: string;
  eventType: string;
  key: string;
  mode: string;
}> => {
  const topSegments = [...segments]
    .sort((left, right) => toNumber(right.count) - toNumber(left.count))
    .slice(0, 8);
  return topSegments.map((segment, index) => ({
    count: toNumber(segment.count),
    draftStatus: segment.draftStatus ?? 'unknown',
    eventType: segment.eventType ?? 'unknown',
    key: `${segment.mode ?? 'unknown'}:${segment.eventType ?? 'event'}:${index + 1}`,
    mode: segment.mode ?? 'unknown',
  }));
};

export const buildEngagementHealthSignals = ({
  healthBadgeClass,
  healthLabel,
  kpis,
  resolveHealthLevel,
  toRateText,
}: {
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  kpis: EngagementKpisInput;
  resolveHealthLevel: (
    value: unknown,
    thresholds: HealthThresholds,
  ) => HealthLevel;
  toRateText: (value: unknown) => string;
}): Array<{
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
  note: string;
  valueText: string;
}> => {
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
    {
      id: 'predictionSortSwitchShare',
      label: 'Prediction sort share',
      note: 'sort switches among prediction-history controls',
      value: kpis.predictionSortSwitchShare,
      thresholds: {
        criticalBelow: 0.25,
        watchBelow: 0.4,
      },
    },
    {
      id: 'predictionNonDefaultSortRate',
      label: 'Non-default sort share',
      note: 'share of sort switches away from recency',
      value: kpis.predictionNonDefaultSortRate,
      thresholds: {
        criticalBelow: 0.15,
        watchBelow: 0.3,
      },
    },
  ].map((signal) => ({
    ...signal,
    level: resolveHealthLevel(signal.value, signal.thresholds),
  }));

  return healthSignals
    .filter((signal) => signal.level !== 'unknown')
    .map((signal) => ({
      badgeClassName: healthBadgeClass(signal.level),
      badgeLabel: healthLabel(signal.level),
      id: signal.id,
      label: signal.label,
      note: signal.note,
      valueText: toRateText(signal.value),
    }));
};

export const buildPanelTabsView = <T extends string>({
  activePanel,
  buildPanelHref,
  panelTabs,
}: {
  activePanel: T;
  buildPanelHref: (panel: T) => string;
  panelTabs: PanelTabInput<T>[];
}): Array<{
  active: boolean;
  href: string;
  id: T;
  label: string;
}> =>
  panelTabs.map((tab) => ({
    active: activePanel === tab.id,
    href: buildPanelHref(tab.id),
    id: tab.id,
    label: tab.label,
  }));

export const buildStickyKpisView = ({
  healthBadgeClass,
  healthLabel,
  kpis,
  resolveHealthLevel,
  toRateText,
}: {
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  kpis: EngagementKpisInput & {
    predictionAccuracyRate?: number | null;
  };
  resolveHealthLevel: (
    value: unknown,
    thresholds: HealthThresholds,
  ) => HealthLevel;
  toRateText: (value: unknown) => string;
}): Array<{
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
  value: string;
}> => {
  const stickyKpis = [
    {
      id: 'kpi-return24h',
      label: '24h retention',
      value: toRateText(kpis.return24h),
      level: resolveHealthLevel(kpis.return24h, {
        criticalBelow: 0.1,
        watchBelow: 0.2,
      }),
    },
    {
      id: 'kpi-follow-rate',
      label: 'Follow rate',
      value: toRateText(kpis.followRate),
      level: resolveHealthLevel(kpis.followRate, {
        criticalBelow: 0.15,
        watchBelow: 0.3,
      }),
    },
    {
      id: 'kpi-digest-open-rate',
      label: 'Digest open',
      value: toRateText(kpis.digestOpenRate),
      level: resolveHealthLevel(kpis.digestOpenRate, {
        criticalBelow: 0.2,
        watchBelow: 0.35,
      }),
    },
    {
      id: 'kpi-prediction-accuracy',
      label: 'Prediction accuracy',
      value: toRateText(kpis.predictionAccuracyRate),
      level: resolveHealthLevel(kpis.predictionAccuracyRate, {
        criticalBelow: 0.45,
        watchBelow: 0.6,
      }),
    },
  ];

  return stickyKpis.map((kpi) => ({
    badgeClassName: healthBadgeClass(kpi.level),
    badgeLabel: healthLabel(kpi.level),
    id: kpi.id,
    label: kpi.label,
    value: kpi.value,
  }));
};

interface BreakdownEntry {
  count: number;
  key: string;
}

interface MultimodalTotalsInput {
  emptyStates?: unknown;
  errors?: unknown;
  views?: unknown;
}

interface GatewayTelemetrySessionsInput {
  attention?: unknown;
  autoCompacted?: unknown;
  compacted?: unknown;
  total?: unknown;
}

interface GatewayTelemetryEventsInput {
  autoCompactionEvents?: unknown;
  autoCompactionShare?: unknown;
  compactionEvents?: unknown;
  draftCycleStepEvents?: unknown;
  failedStepEvents?: unknown;
  failedStepRate?: unknown;
  manualCompactionEvents?: unknown;
  prunedEventCount?: unknown;
  total?: unknown;
}

interface GatewayTelemetryAttemptsInput {
  skippedRate?: unknown;
  successRate?: unknown;
}

interface PredictionTotalsInput {
  markets?: unknown;
  predictions?: unknown;
  predictors?: unknown;
  stakePoints?: unknown;
}

interface PredictionWindowInput {
  accuracyRate: unknown;
  correctPredictions: number;
  days: number;
  netPoints: number;
  predictors: number;
  resolvedPredictions: number;
}

interface PredictionOutcomeCohortInput {
  accuracyRate: unknown;
  netPoints: number;
  predictedOutcome: string;
  predictions: number;
  resolvedPredictions: number;
  riskLevel: HealthLevel;
  settlementRate: unknown;
}

interface PredictionStakeBandCohortInput {
  accuracyRate: unknown;
  netPoints: number;
  predictions: number;
  resolvedPredictions: number;
  riskLevel: HealthLevel;
  settlementRate: unknown;
  stakeBand: string;
}

export const buildReleaseBreakdownRows = ({
  byChannel,
  byFailureMode,
}: {
  byChannel: BreakdownEntry[];
  byFailureMode: BreakdownEntry[];
}): Array<{ category: string; count: number; key: string }> => [
  ...byChannel.map((entry) => ({
    category: 'channel',
    key: entry.key,
    count: entry.count,
  })),
  ...byFailureMode.map((entry) => ({
    category: 'failure mode',
    key: entry.key,
    count: entry.count,
  })),
];

export const buildMultimodalBreakdownRows = ({
  emptyReasonBreakdown,
  errorReasonBreakdown,
  providerBreakdown,
}: {
  emptyReasonBreakdown: BreakdownEntry[];
  errorReasonBreakdown: BreakdownEntry[];
  providerBreakdown: BreakdownEntry[];
}): Array<{ category: string; count: number; key: string }> => [
  ...providerBreakdown.map((entry) => ({
    category: 'provider',
    key: entry.key,
    count: entry.count,
  })),
  ...emptyReasonBreakdown.map((entry) => ({
    category: 'empty reason',
    key: entry.key,
    count: entry.count,
  })),
  ...errorReasonBreakdown.map((entry) => ({
    category: 'error reason',
    key: entry.key,
    count: entry.count,
  })),
];

export const buildMultimodalStatCards = ({
  multimodal,
  multimodalCoverageRate,
  multimodalErrorRate,
  toNumber,
  toRateText,
}: {
  multimodal: MultimodalTotalsInput;
  multimodalCoverageRate: unknown;
  multimodalErrorRate: unknown;
  toNumber: (value: unknown, fallback?: number) => number;
  toRateText: (value: unknown) => string;
}): Array<{ hint: string; label: string; value: string }> => [
  {
    hint: 'draft detail panels with multimodal score loaded',
    label: 'Views',
    value: `${toNumber(multimodal.views)}`,
  },
  {
    hint: 'draft detail panels where multimodal score is unavailable',
    label: 'Empty states',
    value: `${toNumber(multimodal.emptyStates)}`,
  },
  {
    hint: 'draft detail multimodal load errors',
    label: 'Errors',
    value: `${toNumber(multimodal.errors)}`,
  },
  {
    hint: 'view / (view + empty)',
    label: 'Coverage rate',
    value: toRateText(multimodalCoverageRate),
  },
  {
    hint: 'error / (view + empty + error)',
    label: 'Error rate',
    value: toRateText(multimodalErrorRate),
  },
];

export const buildGatewayRiskSignalsView = ({
  autoCompactionLevel,
  cooldownSkipLevel,
  failedStepLevel,
  healthBadgeClass,
  healthLabel,
  runtimeSuccessLevel,
}: {
  autoCompactionLevel: HealthLevel;
  cooldownSkipLevel: HealthLevel;
  failedStepLevel: HealthLevel;
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  runtimeSuccessLevel: HealthLevel;
}): Array<{
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
}> => {
  const riskSignals = [
    {
      id: 'gateway-auto-compaction',
      label: 'Auto compaction risk',
      level: autoCompactionLevel,
    },
    {
      id: 'gateway-failed-step',
      label: 'Failed-step risk',
      level: failedStepLevel,
    },
    {
      id: 'gateway-runtime-success',
      label: 'Runtime success',
      level: runtimeSuccessLevel,
    },
    {
      id: 'gateway-cooldown-skip',
      label: 'Cooldown skip risk',
      level: cooldownSkipLevel,
    },
  ];
  return riskSignals.map((signal) => ({
    badgeClassName: healthBadgeClass(signal.level),
    badgeLabel: healthLabel(signal.level),
    id: signal.id,
    label: signal.label,
  }));
};

export const buildGatewayScopeRows = ({
  appliedGatewayChannelFilter,
  appliedGatewayProviderFilter,
  appliedGatewaySessionStatusLabel,
  gatewaySourceFilter,
}: {
  appliedGatewayChannelFilter: string | null;
  appliedGatewayProviderFilter: string | null;
  appliedGatewaySessionStatusLabel: string;
  gatewaySourceFilter: string | null;
}): Array<{ key: string; value: string }> => [
  {
    key: 'Source',
    value: gatewaySourceFilter === 'memory' ? 'memory' : 'db',
  },
  {
    key: 'Channel',
    value: appliedGatewayChannelFilter ?? 'all',
  },
  {
    key: 'Provider',
    value: appliedGatewayProviderFilter ?? 'all',
  },
  {
    key: 'Status',
    value: appliedGatewaySessionStatusLabel,
  },
];

export const buildGatewayTelemetryStatCards = ({
  attempts,
  events,
  sessions,
  toNumber,
  toRateText,
}: {
  attempts: GatewayTelemetryAttemptsInput;
  events: GatewayTelemetryEventsInput;
  sessions: GatewayTelemetrySessionsInput;
  toNumber: (value: unknown, fallback?: number) => number;
  toRateText: (value: unknown) => string;
}): Array<{ hint: string; label: string; value: string }> => [
  {
    hint: 'sessions sampled in current window',
    label: 'Sessions',
    value: `${toNumber(sessions.total)}`,
  },
  {
    hint: 'sessions with failed steps or failed cycles',
    label: 'Attention sessions',
    value: `${toNumber(sessions.attention)}`,
  },
  {
    hint: 'sessions with at least one compaction event',
    label: 'Compacted sessions',
    value: `${toNumber(sessions.compacted)}`,
  },
  {
    hint: 'sessions compacted by auto buffer guardrail',
    label: 'Auto compacted sessions',
    value: `${toNumber(sessions.autoCompacted)}`,
  },
  {
    hint: 'auto compactions / total compactions',
    label: 'Auto compaction share',
    value: toRateText(events.autoCompactionShare),
  },
  {
    hint: 'failed steps / cycle step events',
    label: 'Failed step rate',
    value: toRateText(events.failedStepRate),
  },
  {
    hint: 'successful provider attempts / total attempts',
    label: 'Runtime success rate',
    value: toRateText(attempts.successRate),
  },
  {
    hint: 'cooldown-skipped attempts / total attempts',
    label: 'Cooldown skip rate',
    value: toRateText(attempts.skippedRate),
  },
];

export const buildGatewayEventCounters = ({
  events,
  toNumber,
}: {
  events: GatewayTelemetryEventsInput;
  toNumber: (value: unknown, fallback?: number) => number;
}): Array<{ key: string; value: string }> => [
  {
    key: 'Total events',
    value: `${toNumber(events.total)}`,
  },
  {
    key: 'Cycle steps',
    value: `${toNumber(events.draftCycleStepEvents)}`,
  },
  {
    key: 'Failed steps',
    value: `${toNumber(events.failedStepEvents)}`,
  },
  {
    key: 'Compactions',
    value: `${toNumber(events.compactionEvents)}`,
  },
  {
    key: 'Auto compactions',
    value: `${toNumber(events.autoCompactionEvents)}`,
  },
  {
    key: 'Manual compactions',
    value: `${toNumber(events.manualCompactionEvents)}`,
  },
  {
    key: 'Pruned events',
    value: `${toNumber(events.prunedEventCount)}`,
  },
];

export const buildPredictionStatCards = ({
  kpis,
  predictionTotals,
  toNumber,
  toRateText,
}: {
  kpis: {
    payoutToStakeRatio?: unknown;
    predictionAccuracyRate?: unknown;
    predictionSettlementRate?: unknown;
  };
  predictionTotals: PredictionTotalsInput;
  toNumber: (value: unknown, fallback?: number) => number;
  toRateText: (value: unknown) => string;
}): Array<{ hint: string; label: string; value: string }> => [
  {
    hint: 'submitted predictions in current window',
    label: 'Predictions',
    value: `${toNumber(predictionTotals.predictions)}`,
  },
  {
    hint: 'unique observers placing predictions',
    label: 'Predictors',
    value: `${toNumber(predictionTotals.predictors)}`,
  },
  {
    hint: 'unique PR markets with predictions',
    label: 'Markets',
    value: `${toNumber(predictionTotals.markets)}`,
  },
  {
    hint: 'total FIN points staked',
    label: 'Stake pool',
    value: `${toNumber(predictionTotals.stakePoints)}`,
  },
  {
    hint: 'correct / resolved predictions',
    label: 'Accuracy rate',
    value: toRateText(kpis.predictionAccuracyRate),
  },
  {
    hint: 'payout points / stake points',
    label: 'Payout ratio',
    value: toRateText(kpis.payoutToStakeRatio),
  },
  {
    hint: 'resolved prediction settlements / submitted predictions',
    label: 'Settlement rate',
    value: toRateText(kpis.predictionSettlementRate),
  },
];

export const buildPredictionWindowView = ({
  healthBadgeClass,
  healthLabel,
  riskLevel,
  toRateText,
  window,
}: {
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  riskLevel: HealthLevel;
  toRateText: (value: unknown) => string;
  window: PredictionWindowInput;
}) => ({
  accuracyText: toRateText(window.accuracyRate),
  correctPredictions: window.correctPredictions,
  days: window.days,
  netPoints: window.netPoints,
  predictors: window.predictors,
  resolvedPredictions: window.resolvedPredictions,
  riskBadgeClassName: healthBadgeClass(riskLevel),
  riskLabel: healthLabel(riskLevel),
});

export const buildPredictionCohortsByOutcomeView = ({
  healthBadgeClass,
  healthLabel,
  rows,
  toRateText,
  toOutcomeLabel,
}: {
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  rows: PredictionOutcomeCohortInput[];
  toOutcomeLabel: (value: string) => string;
  toRateText: (value: unknown) => string;
}) =>
  rows.map((entry) => ({
    accuracyRateText: toRateText(entry.accuracyRate),
    netPoints: entry.netPoints,
    predictedOutcomeLabel: toOutcomeLabel(entry.predictedOutcome),
    predictions: entry.predictions,
    resolvedPredictions: entry.resolvedPredictions,
    riskBadgeClassName: healthBadgeClass(entry.riskLevel),
    riskLabel: healthLabel(entry.riskLevel),
    settlementRateText: toRateText(entry.settlementRate),
  }));

export const buildPredictionCohortsByStakeBandView = ({
  healthBadgeClass,
  healthLabel,
  rows,
  toRateText,
}: {
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  rows: PredictionStakeBandCohortInput[];
  toRateText: (value: unknown) => string;
}) =>
  rows.map((entry) => ({
    accuracyRateText: toRateText(entry.accuracyRate),
    netPoints: entry.netPoints,
    predictions: entry.predictions,
    resolvedPredictions: entry.resolvedPredictions,
    riskBadgeClassName: healthBadgeClass(entry.riskLevel),
    riskLabel: healthLabel(entry.riskLevel),
    settlementRateText: toRateText(entry.settlementRate),
    stakeBand: entry.stakeBand,
  }));
