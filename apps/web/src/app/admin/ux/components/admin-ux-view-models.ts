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

  return stickyKpis
    .filter((kpi) => kpi.level !== 'unknown')
    .map((kpi) => ({
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
  autoCompactionRiskLevel?: unknown;
  autoCompactionShare?: unknown;
  compactionHourlyTrend?: unknown;
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

interface GatewayTelemetryHealthInput {
  autoCompactionLevel?: unknown;
  cooldownSkipLevel?: unknown;
  failedStepLevel?: unknown;
  level?: unknown;
  runtimeSuccessLevel?: unknown;
}

interface GatewayRiskAboveThresholdsInput {
  criticalAbove: number;
  watchAbove: number;
}

interface GatewayRiskBelowThresholdsInput {
  criticalBelow: number;
  watchBelow: number;
}

interface GatewayTelemetryThresholdsInput {
  autoCompactionShare: GatewayRiskAboveThresholdsInput;
  cooldownSkipRate: GatewayRiskAboveThresholdsInput;
  failedStepRate: GatewayRiskAboveThresholdsInput;
  runtimeSuccessRate: GatewayRiskBelowThresholdsInput;
}

interface GatewaySessionFiltersInput {
  channel: string | null;
  provider: string | null;
  status: string | null;
}

interface PredictionTotalsInput {
  markets?: unknown;
  predictions?: unknown;
  predictors?: unknown;
  stakePoints?: unknown;
}

interface PredictionWindowInput {
  accuracyRate: number | null;
  correctPredictions: number;
  days: number;
  netPoints: number;
  predictors: number;
  resolvedPredictions: number;
}

interface PredictionResolutionWindowModelInput extends PredictionWindowInput {
  riskLevel: HealthLevel | null;
}

interface PredictionResolutionWindowThresholdsInput {
  accuracyRate: {
    criticalBelow: number;
    watchBelow: number;
  };
  minResolvedPredictions: number;
}

interface PredictionCohortRiskThresholdsInput {
  accuracyRate: {
    criticalBelow: number;
    watchBelow: number;
  };
  minResolvedPredictions: number;
  settlementRate: {
    criticalBelow: number;
    watchBelow: number;
  };
}

interface PredictionOutcomeCohortBaseInput {
  accuracyRate: number | null;
  netPoints: number;
  predictedOutcome: string;
  predictions: number;
  resolvedPredictions: number;
  settlementRate: number | null;
}

interface PredictionOutcomeCohortInput
  extends PredictionOutcomeCohortBaseInput {
  riskLevel: HealthLevel;
}

interface PredictionStakeBandCohortBaseInput {
  accuracyRate: number | null;
  netPoints: number;
  predictions: number;
  resolvedPredictions: number;
  settlementRate: number | null;
  stakeBand: string;
}

interface PredictionStakeBandCohortInput
  extends PredictionStakeBandCohortBaseInput {
  riskLevel: HealthLevel;
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

export const buildGatewayTelemetryView = <TGatewayCompactionHourlyTrendItem>({
  gatewayChannelFilter,
  gatewayProviderFilter,
  gatewaySessionFilters,
  gatewayStatusFilter,
  gatewayTelemetry,
  normalizeBreakdownItems,
  normalizeGatewayCompactionHourlyTrendItems,
  normalizeGatewayTelemetryFilters,
  normalizeGatewayTelemetryThresholds,
  resolveGatewaySessionScope,
  resolveGatewayTelemetryHealthLevel,
  resolveHealthLevel,
  resolveRiskHealthLevel,
  toHealthLevelValue,
}: {
  gatewayChannelFilter: string | null;
  gatewayProviderFilter: string | null;
  gatewaySessionFilters: GatewaySessionFiltersInput;
  gatewayStatusFilter: string | null;
  gatewayTelemetry: unknown;
  normalizeBreakdownItems: (
    args: BreakdownNormalizeArgs,
  ) => Array<{ count: number; key: string }>;
  normalizeGatewayCompactionHourlyTrendItems: (
    items: unknown,
    thresholds: GatewayRiskAboveThresholdsInput,
  ) => TGatewayCompactionHourlyTrendItem[];
  normalizeGatewayTelemetryFilters: (value: unknown) => {
    channel: string | null;
    provider: string | null;
  };
  normalizeGatewayTelemetryThresholds: (
    value: unknown,
  ) => GatewayTelemetryThresholdsInput;
  resolveGatewaySessionScope: (args: {
    queryChannel: string | null;
    queryProvider: string | null;
    queryStatus: string | null;
    sessionFilters: GatewaySessionFiltersInput;
  }) => {
    channel: string | null;
    label: string;
    provider: string | null;
    status: string | null;
    statusInputValue: string;
    statusLabel: string;
  };
  resolveGatewayTelemetryHealthLevel: (args: {
    autoCompactionRiskLevel: HealthLevel;
    failedStepRate: unknown;
    runtimeSuccessRate: unknown;
    skippedRate: unknown;
    thresholds: GatewayTelemetryThresholdsInput;
  }) => HealthLevel;
  resolveHealthLevel: (
    value: unknown,
    thresholds: GatewayRiskBelowThresholdsInput,
  ) => HealthLevel;
  resolveRiskHealthLevel: (
    value: unknown,
    thresholds: GatewayRiskAboveThresholdsInput,
  ) => HealthLevel;
  toHealthLevelValue: (value: unknown) => HealthLevel | null;
}) => {
  const telemetry =
    gatewayTelemetry && typeof gatewayTelemetry === 'object'
      ? (gatewayTelemetry as Record<string, unknown>)
      : {};
  const gatewayTelemetrySessions =
    telemetry.sessions && typeof telemetry.sessions === 'object'
      ? (telemetry.sessions as GatewayTelemetrySessionsInput)
      : {};
  const gatewayTelemetryEvents =
    telemetry.events && typeof telemetry.events === 'object'
      ? (telemetry.events as GatewayTelemetryEventsInput)
      : {};
  const gatewayTelemetryAttempts =
    telemetry.attempts && typeof telemetry.attempts === 'object'
      ? (telemetry.attempts as GatewayTelemetryAttemptsInput)
      : {};
  const gatewayTelemetryHealth =
    telemetry.health && typeof telemetry.health === 'object'
      ? (telemetry.health as GatewayTelemetryHealthInput)
      : {};
  const gatewayTelemetryThresholds = normalizeGatewayTelemetryThresholds(
    telemetry.thresholds,
  );
  const gatewayTelemetryFilters = normalizeGatewayTelemetryFilters(
    telemetry.filters,
  );
  const appliedGatewayChannelFilter =
    gatewayTelemetryFilters.channel ?? gatewayChannelFilter;
  const appliedGatewayProviderFilter =
    gatewayTelemetryFilters.provider ?? gatewayProviderFilter;
  const {
    channel: appliedGatewaySessionChannelFilter,
    provider: appliedGatewaySessionProviderFilter,
    statusInputValue: appliedGatewaySessionStatusInputValue,
    statusLabel: appliedGatewaySessionStatusLabel,
    label: gatewaySessionScopeLabel,
  } = resolveGatewaySessionScope({
    queryChannel: gatewayChannelFilter,
    queryProvider: gatewayProviderFilter,
    queryStatus: gatewayStatusFilter,
    sessionFilters: gatewaySessionFilters,
  });
  const gatewayCompactionHourlyTrend =
    normalizeGatewayCompactionHourlyTrendItems(
      gatewayTelemetryEvents.compactionHourlyTrend,
      gatewayTelemetryThresholds.autoCompactionShare,
    );
  const gatewayTelemetryProviderUsage = normalizeBreakdownItems({
    items: telemetry.providerUsage,
    keyName: 'provider',
  });
  const gatewayTelemetryChannelUsage = normalizeBreakdownItems({
    items: telemetry.channelUsage,
    keyName: 'channel',
  });
  const gatewayAutoCompactionShareLevel =
    toHealthLevelValue(gatewayTelemetryEvents.autoCompactionRiskLevel) ??
    resolveRiskHealthLevel(
      gatewayTelemetryEvents.autoCompactionShare,
      gatewayTelemetryThresholds.autoCompactionShare,
    );
  const gatewayFailedStepLevel =
    toHealthLevelValue(gatewayTelemetryHealth.failedStepLevel) ??
    resolveRiskHealthLevel(
      gatewayTelemetryEvents.failedStepRate,
      gatewayTelemetryThresholds.failedStepRate,
    );
  const gatewayRuntimeSuccessLevel =
    toHealthLevelValue(gatewayTelemetryHealth.runtimeSuccessLevel) ??
    resolveHealthLevel(
      gatewayTelemetryAttempts.successRate,
      gatewayTelemetryThresholds.runtimeSuccessRate,
    );
  const gatewayCooldownSkipLevel =
    toHealthLevelValue(gatewayTelemetryHealth.cooldownSkipLevel) ??
    resolveRiskHealthLevel(
      gatewayTelemetryAttempts.skippedRate,
      gatewayTelemetryThresholds.cooldownSkipRate,
    );
  const gatewayTelemetryHealthLevel = resolveGatewayTelemetryHealthLevel({
    autoCompactionRiskLevel:
      toHealthLevelValue(gatewayTelemetryHealth.autoCompactionLevel) ??
      gatewayAutoCompactionShareLevel,
    failedStepRate: gatewayTelemetryEvents.failedStepRate,
    runtimeSuccessRate: gatewayTelemetryAttempts.successRate,
    skippedRate: gatewayTelemetryAttempts.skippedRate,
    thresholds: gatewayTelemetryThresholds,
  });
  const gatewayTelemetryHealthLevelFromApi = toHealthLevelValue(
    gatewayTelemetryHealth.level,
  );
  const resolvedGatewayTelemetryHealthLevel =
    gatewayTelemetryHealthLevelFromApi ?? gatewayTelemetryHealthLevel;

  return {
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionChannelFilter,
    appliedGatewaySessionProviderFilter,
    appliedGatewaySessionStatusInputValue,
    appliedGatewaySessionStatusLabel,
    gatewayAutoCompactionShareLevel,
    gatewayCompactionHourlyTrend,
    gatewayCooldownSkipLevel,
    gatewayFailedStepLevel,
    gatewayRuntimeSuccessLevel,
    gatewaySessionScopeLabel,
    gatewayTelemetryAttempts,
    gatewayTelemetryChannelUsage,
    gatewayTelemetryEvents,
    gatewayTelemetryProviderUsage,
    gatewayTelemetrySessions,
    gatewayTelemetryThresholds,
    resolvedGatewayTelemetryHealthLevel,
  };
};

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

export const buildPredictionMarketTelemetryView = <
  THourlyTrendItem,
  TPredictFilterScopeFilterItem,
  TPredictSortScopeSortItem,
  TPredictHistoryScopeStateItem,
>({
  formatPredictionOutcomeMetricLabel,
  normalizeBreakdownItems,
  normalizePredictionCohortByOutcomeItems,
  normalizePredictionCohortByStakeBandItems,
  normalizePredictionFilterScopeFilterItems,
  normalizePredictionHistoryScopeStateItems,
  normalizePredictionHourlyTrendItems,
  normalizePredictionResolutionWindow,
  normalizePredictionResolutionWindowThresholds,
  normalizePredictionSortScopeSortItems,
  normalizePredictionCohortRiskThresholds,
  predictionFilterTelemetry,
  predictionHistoryStateTelemetry,
  predictionMarket,
  predictionSortTelemetry,
  resolvePredictionCohortHealthLevel,
  resolvePredictionResolutionWindowHealthLevel,
  toRateText,
}: {
  formatPredictionOutcomeMetricLabel: (value: string) => string;
  normalizeBreakdownItems: (
    args: BreakdownNormalizeArgs,
  ) => Array<{ count: number; key: string }>;
  normalizePredictionCohortByOutcomeItems: (
    items: unknown,
  ) => PredictionOutcomeCohortBaseInput[];
  normalizePredictionCohortByStakeBandItems: (
    items: unknown,
  ) => PredictionStakeBandCohortBaseInput[];
  normalizePredictionFilterScopeFilterItems: (
    items: unknown,
  ) => TPredictFilterScopeFilterItem[];
  normalizePredictionHistoryScopeStateItems: (
    items: unknown,
  ) => TPredictHistoryScopeStateItem[];
  normalizePredictionHourlyTrendItems: (items: unknown) => THourlyTrendItem[];
  normalizePredictionResolutionWindow: (
    value: unknown,
    fallbackDays: number,
  ) => PredictionResolutionWindowModelInput;
  normalizePredictionResolutionWindowThresholds: (
    value: unknown,
  ) => PredictionResolutionWindowThresholdsInput;
  normalizePredictionSortScopeSortItems: (
    items: unknown,
  ) => TPredictSortScopeSortItem[];
  normalizePredictionCohortRiskThresholds: (
    value: unknown,
  ) => PredictionCohortRiskThresholdsInput;
  predictionFilterTelemetry: unknown;
  predictionHistoryStateTelemetry: unknown;
  predictionMarket: unknown;
  predictionSortTelemetry: unknown;
  resolvePredictionCohortHealthLevel: (args: {
    accuracyRate: number | null;
    resolvedPredictions: number;
    settlementRate: number | null;
    thresholds: PredictionCohortRiskThresholdsInput;
  }) => HealthLevel;
  resolvePredictionResolutionWindowHealthLevel: (
    window: PredictionResolutionWindowModelInput,
    thresholds: PredictionResolutionWindowThresholdsInput,
  ) => HealthLevel;
  toRateText: (value: unknown) => string;
}) => {
  const market =
    predictionMarket && typeof predictionMarket === 'object'
      ? (predictionMarket as Record<string, unknown>)
      : {};
  const predictionTotals =
    market.totals && typeof market.totals === 'object'
      ? (market.totals as Record<string, unknown>)
      : {};
  const predictionOutcomesBreakdown = normalizeBreakdownItems({
    countName: 'predictions',
    items: market.outcomes,
    keyName: 'predictedOutcome',
  }).map((entry) => ({
    ...entry,
    key: formatPredictionOutcomeMetricLabel(entry.key),
  }));
  const predictionCohorts =
    market.cohorts && typeof market.cohorts === 'object'
      ? (market.cohorts as Record<string, unknown>)
      : {};
  const predictionCohortsByOutcome = normalizePredictionCohortByOutcomeItems(
    predictionCohorts.byOutcome,
  );
  const predictionCohortsByStakeBand =
    normalizePredictionCohortByStakeBandItems(predictionCohorts.byStakeBand);
  const predictionHourlyTrend = normalizePredictionHourlyTrendItems(
    market.hourlyTrend,
  );
  const predictionResolutionWindows =
    market.resolutionWindows && typeof market.resolutionWindows === 'object'
      ? (market.resolutionWindows as Record<string, unknown>)
      : {};
  const predictionMarketThresholds =
    market.thresholds && typeof market.thresholds === 'object'
      ? (market.thresholds as Record<string, unknown>)
      : {};
  const predictionResolutionWindowThresholds =
    normalizePredictionResolutionWindowThresholds(
      predictionMarketThresholds.resolutionWindows,
    );
  const predictionCohortRiskThresholds =
    normalizePredictionCohortRiskThresholds(predictionMarketThresholds.cohorts);
  const predictionCohortThresholdSummary = `settlement watch < ${toRateText(predictionCohortRiskThresholds.settlementRate.watchBelow)} | settlement critical < ${toRateText(predictionCohortRiskThresholds.settlementRate.criticalBelow)} | accuracy watch < ${toRateText(predictionCohortRiskThresholds.accuracyRate.watchBelow)} | accuracy critical < ${toRateText(predictionCohortRiskThresholds.accuracyRate.criticalBelow)} | min sample: ${predictionCohortRiskThresholds.minResolvedPredictions}`;
  const predictionCohortsByOutcomeWithRisk = predictionCohortsByOutcome.map(
    (entry) => ({
      ...entry,
      riskLevel: resolvePredictionCohortHealthLevel({
        accuracyRate: entry.accuracyRate,
        resolvedPredictions: entry.resolvedPredictions,
        settlementRate: entry.settlementRate,
        thresholds: predictionCohortRiskThresholds,
      }),
    }),
  );
  const predictionCohortsByStakeBandWithRisk = predictionCohortsByStakeBand.map(
    (entry) => ({
      ...entry,
      riskLevel: resolvePredictionCohortHealthLevel({
        accuracyRate: entry.accuracyRate,
        resolvedPredictions: entry.resolvedPredictions,
        settlementRate: entry.settlementRate,
        thresholds: predictionCohortRiskThresholds,
      }),
    }),
  );
  const predictionWindow7d = normalizePredictionResolutionWindow(
    predictionResolutionWindows.d7,
    7,
  );
  const predictionWindow30d = normalizePredictionResolutionWindow(
    predictionResolutionWindows.d30,
    30,
  );
  const predictionWindow7dRiskLevel =
    resolvePredictionResolutionWindowHealthLevel(
      predictionWindow7d,
      predictionResolutionWindowThresholds,
    );
  const predictionWindow30dRiskLevel =
    resolvePredictionResolutionWindowHealthLevel(
      predictionWindow30d,
      predictionResolutionWindowThresholds,
    );
  const filterTelemetry =
    predictionFilterTelemetry && typeof predictionFilterTelemetry === 'object'
      ? (predictionFilterTelemetry as Record<string, unknown>)
      : {};
  const predictionFilterByScopeBreakdown = normalizeBreakdownItems({
    items: filterTelemetry.byScope,
    keyName: 'scope',
  });
  const predictionFilterByFilterBreakdown = normalizeBreakdownItems({
    items: filterTelemetry.byFilter,
    keyName: 'filter',
  });
  const predictionFilterByScopeAndFilter =
    normalizePredictionFilterScopeFilterItems(filterTelemetry.byScopeAndFilter);
  const sortTelemetry =
    predictionSortTelemetry && typeof predictionSortTelemetry === 'object'
      ? (predictionSortTelemetry as Record<string, unknown>)
      : {};
  const predictionSortByScopeBreakdown = normalizeBreakdownItems({
    items: sortTelemetry.byScope,
    keyName: 'scope',
  });
  const predictionSortBySortBreakdown = normalizeBreakdownItems({
    items: sortTelemetry.bySort,
    keyName: 'sort',
  });
  const predictionSortByScopeAndSort = normalizePredictionSortScopeSortItems(
    sortTelemetry.byScopeAndSort,
  );
  const historyStateTelemetry =
    predictionHistoryStateTelemetry &&
    typeof predictionHistoryStateTelemetry === 'object'
      ? (predictionHistoryStateTelemetry as Record<string, unknown>)
      : {};
  const predictionHistoryScopeStates =
    normalizePredictionHistoryScopeStateItems(historyStateTelemetry.byScope);

  return {
    predictionCohortThresholdSummary,
    predictionCohortsByOutcomeWithRisk,
    predictionCohortsByStakeBandWithRisk,
    predictionFilterByFilterBreakdown,
    predictionFilterByScopeAndFilter,
    predictionFilterByScopeBreakdown,
    predictionHistoryScopeStates,
    predictionHourlyTrend,
    predictionOutcomesBreakdown,
    predictionResolutionWindowThresholds,
    predictionSortByScopeAndSort,
    predictionSortByScopeBreakdown,
    predictionSortBySortBreakdown,
    predictionTotals,
    predictionWindow30d,
    predictionWindow30dRiskLevel,
    predictionWindow7d,
    predictionWindow7dRiskLevel,
  };
};

interface BreakdownNormalizeArgs {
  countName?: string;
  items: unknown;
  keyName: string;
}

interface MultimodalTelemetryInput {
  coverageRate?: unknown;
  emptyReasonBreakdown?: unknown;
  errorRate?: unknown;
  errorReasonBreakdown?: unknown;
  guardrails?: unknown;
  hourlyTrend?: unknown;
  providerBreakdown?: unknown;
}

interface MultimodalKpisInput {
  multimodalCoverageRate?: unknown;
  multimodalErrorRate?: unknown;
}

export const buildMultimodalTelemetryView = <THourlyTrendItem>({
  kpis,
  multimodal,
  normalizeBreakdownItems,
  normalizeHourlyTrendItems,
  pickFirstFiniteRate,
  resolveHealthLevel,
  resolveRiskHealthLevel,
}: {
  kpis: MultimodalKpisInput;
  multimodal: MultimodalTelemetryInput;
  normalizeBreakdownItems: (
    args: BreakdownNormalizeArgs,
  ) => Array<{ count: number; key: string }>;
  normalizeHourlyTrendItems: (items: unknown) => THourlyTrendItem[];
  pickFirstFiniteRate: (...values: unknown[]) => number | null;
  resolveHealthLevel: (
    value: unknown,
    thresholds: { criticalBelow: number; watchBelow: number },
  ) => HealthLevel;
  resolveRiskHealthLevel: (
    value: unknown,
    thresholds: { criticalAbove: number; watchAbove: number },
  ) => HealthLevel;
}) => {
  const multimodalCoverageRate = pickFirstFiniteRate(
    multimodal.coverageRate,
    kpis.multimodalCoverageRate,
  );
  const multimodalErrorRate = pickFirstFiniteRate(
    multimodal.errorRate,
    kpis.multimodalErrorRate,
  );
  const multimodalCoverageLevel = resolveHealthLevel(multimodalCoverageRate, {
    criticalBelow: 0.45,
    watchBelow: 0.65,
  });
  const multimodalErrorLevel = resolveRiskHealthLevel(multimodalErrorRate, {
    criticalAbove: 0.2,
    watchAbove: 0.1,
  });

  let multimodalOverallLevel: HealthLevel = 'healthy';
  if (
    multimodalCoverageLevel === 'critical' ||
    multimodalErrorLevel === 'critical'
  ) {
    multimodalOverallLevel = 'critical';
  } else if (
    multimodalCoverageLevel === 'watch' ||
    multimodalErrorLevel === 'watch'
  ) {
    multimodalOverallLevel = 'watch';
  } else if (
    multimodalCoverageLevel === 'unknown' &&
    multimodalErrorLevel === 'unknown'
  ) {
    multimodalOverallLevel = 'unknown';
  }

  return {
    multimodalCoverageLevel,
    multimodalCoverageRate,
    multimodalEmptyReasonBreakdown: normalizeBreakdownItems({
      items: multimodal.emptyReasonBreakdown,
      keyName: 'reason',
    }),
    multimodalErrorLevel,
    multimodalErrorRate,
    multimodalErrorReasonBreakdown: normalizeBreakdownItems({
      items: multimodal.errorReasonBreakdown,
      keyName: 'reason',
    }),
    multimodalGuardrails:
      multimodal.guardrails && typeof multimodal.guardrails === 'object'
        ? (multimodal.guardrails as Record<string, unknown>)
        : {},
    multimodalHourlyTrend: normalizeHourlyTrendItems(multimodal.hourlyTrend),
    multimodalOverallLevel,
    multimodalProviderBreakdown: normalizeBreakdownItems({
      items: multimodal.providerBreakdown,
      keyName: 'provider',
    }),
  };
};

interface ReleaseHealthAlertsInput {
  byChannel?: unknown;
  byFailureMode?: unknown;
  firstAppearanceCount?: unknown;
  hourlyTrend?: unknown;
  latest?: unknown;
  totalAlerts?: unknown;
  uniqueRuns?: unknown;
}

interface ReleaseHealthKpisInput {
  releaseHealthAlertCount?: unknown;
  releaseHealthAlertedRunCount?: unknown;
  releaseHealthFirstAppearanceCount?: unknown;
}

export const buildReleaseHealthAlertsView = <THourlyTrendItem>({
  deriveReleaseHealthAlertRiskLevel,
  kpis,
  normalizeBreakdownItems,
  normalizeReleaseHealthAlertHourlyTrendItems,
  releaseHealthAlerts,
  toNullableIsoTimestamp,
  toNumber,
}: {
  deriveReleaseHealthAlertRiskLevel: (args: {
    alertedRuns: number;
    firstAppearances: number;
    totalAlerts: number;
  }) => HealthLevel;
  kpis: ReleaseHealthKpisInput;
  normalizeBreakdownItems: (
    args: BreakdownNormalizeArgs,
  ) => Array<{ count: number; key: string }>;
  normalizeReleaseHealthAlertHourlyTrendItems: (
    items: unknown,
  ) => THourlyTrendItem[];
  releaseHealthAlerts: ReleaseHealthAlertsInput;
  toNullableIsoTimestamp: (value: unknown) => string | null;
  toNumber: (value: unknown, fallback?: number) => number;
}) => {
  const releaseHealthAlertByChannel = normalizeBreakdownItems({
    items: releaseHealthAlerts.byChannel,
    keyName: 'channel',
  });
  const releaseHealthAlertByFailureMode = normalizeBreakdownItems({
    items: releaseHealthAlerts.byFailureMode,
    keyName: 'failureMode',
  });
  const releaseHealthAlertHourlyTrend =
    normalizeReleaseHealthAlertHourlyTrendItems(
      releaseHealthAlerts.hourlyTrend,
    );
  const releaseHealthAlertCount = toNumber(
    releaseHealthAlerts.totalAlerts,
    toNumber(kpis.releaseHealthAlertCount),
  );
  const releaseHealthAlertFirstAppearanceCount = toNumber(
    releaseHealthAlerts.firstAppearanceCount,
    toNumber(kpis.releaseHealthFirstAppearanceCount),
  );
  const releaseHealthAlertedRunCount = toNumber(
    releaseHealthAlerts.uniqueRuns,
    toNumber(kpis.releaseHealthAlertedRunCount),
  );
  const releaseHealthAlertRiskLevel = deriveReleaseHealthAlertRiskLevel({
    alertedRuns: releaseHealthAlertedRunCount,
    firstAppearances: releaseHealthAlertFirstAppearanceCount,
    totalAlerts: releaseHealthAlertCount,
  });
  const releaseHealthAlertLatest =
    releaseHealthAlerts.latest && typeof releaseHealthAlerts.latest === 'object'
      ? (releaseHealthAlerts.latest as {
          receivedAtUtc?: string | null;
          runId?: number | null;
          runNumber?: number | null;
          runUrl?: string | null;
        })
      : null;
  const releaseHealthAlertLatestReceivedAt = toNullableIsoTimestamp(
    releaseHealthAlertLatest?.receivedAtUtc,
  );
  const releaseHealthAlertLatestRunNumber =
    typeof releaseHealthAlertLatest?.runNumber === 'number' &&
    Number.isInteger(releaseHealthAlertLatest.runNumber) &&
    releaseHealthAlertLatest.runNumber > 0
      ? releaseHealthAlertLatest.runNumber
      : null;
  const releaseHealthAlertLatestRunId =
    typeof releaseHealthAlertLatest?.runId === 'number' &&
    Number.isInteger(releaseHealthAlertLatest.runId) &&
    releaseHealthAlertLatest.runId > 0
      ? releaseHealthAlertLatest.runId
      : null;
  let releaseHealthAlertLatestRunLabel = 'n/a';
  if (releaseHealthAlertLatestRunNumber !== null) {
    releaseHealthAlertLatestRunLabel = `#${releaseHealthAlertLatestRunNumber}`;
  } else if (releaseHealthAlertLatestRunId !== null) {
    releaseHealthAlertLatestRunLabel = String(releaseHealthAlertLatestRunId);
  }

  return {
    releaseHealthAlertByChannel,
    releaseHealthAlertByFailureMode,
    releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertHourlyTrend,
    releaseHealthAlertLatest,
    releaseHealthAlertLatestReceivedAt,
    releaseHealthAlertLatestRunLabel,
    releaseHealthAlertRiskLevel,
    releaseHealthAlertedRunCount,
  };
};

interface FeedPreferencesInput {
  density?: {
    total?: unknown;
  };
  hint?: {
    totalInteractions?: unknown;
  };
  viewMode?: {
    total?: unknown;
  };
}

interface EngagementCompactionKpisInput {
  densityComfortRate?: unknown;
  densityCompactRate?: unknown;
  digestOpenRate?: unknown;
  followRate?: unknown;
  hintDismissRate?: unknown;
  observerSessionTimeSec?: unknown;
  return24h?: unknown;
  sessionCount?: unknown;
  viewModeFocusRate?: unknown;
  viewModeObserverRate?: unknown;
}

export const buildEngagementCompactionView = ({
  feedPreferences,
  kpis,
  toNumber,
}: {
  feedPreferences: FeedPreferencesInput;
  kpis: EngagementCompactionKpisInput;
  toNumber: (value: unknown, fallback?: number) => number;
}) => {
  const viewModeTotal = toNumber(feedPreferences.viewMode?.total);
  const densityTotal = toNumber(feedPreferences.density?.total);
  const hintInteractionTotal = toNumber(
    feedPreferences.hint?.totalInteractions,
  );
  const feedPreferenceInteractionTotal =
    viewModeTotal + densityTotal + hintInteractionTotal;

  const engagementSessionCount = toNumber(kpis.sessionCount);
  const engagementAvgSessionSeconds = toNumber(kpis.observerSessionTimeSec);
  const hasEngagementRateSample = [
    kpis.followRate,
    kpis.digestOpenRate,
    kpis.return24h,
  ].some((rate) => typeof rate === 'number' && Number.isFinite(rate));

  const hasFeedPreferenceRateSample = [
    kpis.viewModeObserverRate,
    kpis.viewModeFocusRate,
    kpis.densityComfortRate,
    kpis.densityCompactRate,
    kpis.hintDismissRate,
  ].some((rate) => typeof rate === 'number' && Number.isFinite(rate));

  return {
    densityTotal,
    engagementAvgSessionSeconds,
    engagementSessionCount,
    hintInteractionTotal,
    shouldCompactEngagementOverview:
      engagementSessionCount === 0 &&
      engagementAvgSessionSeconds === 0 &&
      !hasEngagementRateSample,
    shouldCompactFeedPreferenceEvents: feedPreferenceInteractionTotal === 0,
    shouldCompactFeedPreferenceKpis:
      feedPreferenceInteractionTotal === 0 && !hasFeedPreferenceRateSample,
    viewModeTotal,
  };
};

export const buildDebugPayloadText = ({
  activePanel,
  aiRuntimeDryRunResult,
  aiRuntimeProviders,
  aiRuntimeSummary,
  gatewayChannelFilter,
  gatewayOverview,
  gatewayProviderFilter,
  gatewayRecentEvents,
  gatewaySourceFilter,
  gatewayStatusFilter,
  gatewayTelemetry,
  observabilitySnapshot,
  releaseHealthAlertCount,
  releaseHealthAlertFirstAppearanceCount,
  releaseHealthAlertLatest,
  releaseHealthAlertedRunCount,
}: {
  activePanel: string;
  aiRuntimeDryRunResult: unknown;
  aiRuntimeProviders: unknown[];
  aiRuntimeSummary: unknown;
  gatewayChannelFilter: string | null;
  gatewayOverview: unknown;
  gatewayProviderFilter: string | null;
  gatewayRecentEvents: unknown[] | null;
  gatewaySourceFilter: string | null;
  gatewayStatusFilter: string | null;
  gatewayTelemetry: unknown;
  observabilitySnapshot: unknown;
  releaseHealthAlertCount: number;
  releaseHealthAlertFirstAppearanceCount: number;
  releaseHealthAlertLatest: unknown;
  releaseHealthAlertedRunCount: number;
}): string => {
  const eventsSample = Array.isArray(gatewayRecentEvents)
    ? gatewayRecentEvents.slice(0, 10)
    : [];
  const payload = {
    activePanel,
    filters: {
      gatewayChannelFilter,
      gatewayProviderFilter,
      gatewaySourceFilter,
      gatewayStatusFilter,
    },
    gateway: {
      overview: gatewayOverview,
      telemetry: gatewayTelemetry,
      eventsSample,
    },
    runtime: {
      summary: aiRuntimeSummary,
      providers: aiRuntimeProviders,
      dryRun: aiRuntimeDryRunResult,
    },
    observability: observabilitySnapshot,
    release: {
      latest: releaseHealthAlertLatest,
      counts: {
        releaseHealthAlertCount,
        releaseHealthAlertFirstAppearanceCount,
        releaseHealthAlertedRunCount,
      },
    },
  };
  return JSON.stringify(payload, null, 2);
};

export const buildDebugContextRows = ({
  activePanel,
  gatewaySessionScopeLabel,
  gatewaySessionsSource,
  gatewayStatusLabel,
  hours,
  observabilityApiErrorRate,
  observabilityApiP95,
  observabilityFallbackRate,
  observabilityHealthLabel,
  releaseRiskLabel,
  runtimeHealthLabel,
  selectedSessionId,
}: {
  activePanel: string;
  gatewaySessionScopeLabel: string;
  gatewaySessionsSource: string;
  gatewayStatusLabel: string;
  hours: number;
  observabilityApiErrorRate: string;
  observabilityApiP95: string;
  observabilityFallbackRate: string;
  observabilityHealthLabel: string;
  releaseRiskLabel: string;
  runtimeHealthLabel: string;
  selectedSessionId: string | null;
}): Array<{ label: string; value: string }> => [
  { label: 'Panel', value: activePanel },
  { label: 'Hours', value: `${hours}` },
  {
    label: 'Gateway source',
    value: gatewaySessionsSource,
  },
  { label: 'Session id', value: selectedSessionId ?? 'n/a' },
  { label: 'Session scope', value: gatewaySessionScopeLabel },
  {
    label: 'Gateway status',
    value: gatewayStatusLabel,
  },
  {
    label: 'Runtime health',
    value: runtimeHealthLabel,
  },
  {
    label: 'Observability health',
    value: observabilityHealthLabel,
  },
  {
    label: 'API p95',
    value: observabilityApiP95,
  },
  {
    label: 'API error rate',
    value: observabilityApiErrorRate,
  },
  {
    label: 'Fallback path',
    value: observabilityFallbackRate,
  },
  { label: 'Release risk', value: releaseRiskLabel },
];
