import type { ComponentProps } from 'react';
import type { AdminUxMainPanels } from './admin-ux-main-panels';
import {
  healthBadgeClass,
  healthLabel,
  toDurationText,
  toFixedText,
  toNumber,
  toRateText,
  toStringValue,
} from './admin-ux-mappers';
import { type AdminUxPanel, buildEventsCsv } from './admin-ux-page-utils';
import {
  buildDebugContextRows,
  buildDebugPayloadText,
} from './admin-ux-view-models';
import { AI_RUNTIME_ROLES } from './ai-runtime-orchestration';
import {
  BreakdownListCard,
  GatewayCompactionHourlyTrendCard,
  GatewayTelemetryThresholdsCard,
  HourlyTrendCard,
  PredictionHourlyTrendCard,
  ReleaseHealthAlertHourlyTrendCard,
} from './telemetry-shared-cards';

type MainPanelsProps = ComponentProps<typeof AdminUxMainPanels>;
type BuiltMainPanelsProps = Omit<MainPanelsProps, 'activePanel'>;

type GatewayPanelsProps = MainPanelsProps['gatewayPanelsProps'];
type GatewayLiveBodyProps = GatewayPanelsProps['liveBodyProps'];
type GatewayTelemetryBodyProps = GatewayPanelsProps['telemetryBodyProps'];
type RuntimePanelProps = MainPanelsProps['runtimePanelProps'];
type RuntimeBodyProps = RuntimePanelProps['bodyProps'];
type EngagementOverviewProps = MainPanelsProps['engagementOverviewProps'];
type EngagementHealthProps = MainPanelsProps['engagementHealthProps'];
type ReleaseHealthSectionProps = MainPanelsProps['releaseHealthSectionProps'];
type FeedPreferenceKpisProps = MainPanelsProps['feedPreferenceKpisProps'];
type MultimodalTelemetrySectionProps =
  MainPanelsProps['multimodalTelemetrySectionProps'];
type PredictionMarketSectionProps =
  MainPanelsProps['predictionMarketSectionProps'];
type StyleFusionMetricsSectionProps =
  MainPanelsProps['styleFusionMetricsSectionProps'];
type DebugDiagnosticsSectionProps =
  MainPanelsProps['debugDiagnosticsSectionProps'];
type FeedInteractionCountersProps =
  MainPanelsProps['feedInteractionCountersProps'];
type TopSegmentsProps = MainPanelsProps['topSegmentsProps'];

interface BuildAdminUxMainPanelsPropsInput {
  activePanel: AdminUxPanel;
  hours: number;
  aiFailuresCsv: RuntimeBodyProps['aiFailuresCsv'];
  aiPrompt: RuntimeBodyProps['aiPrompt'];
  aiProvidersCsv: RuntimeBodyProps['aiProvidersCsv'];
  aiRole: RuntimeBodyProps['aiRole'];
  aiRuntimeDryRunErrorMessage: RuntimeBodyProps['aiRuntimeDryRunErrorMessage'];
  aiRuntimeDryRunInfoMessage: RuntimeBodyProps['aiRuntimeDryRunInfoMessage'];
  aiRuntimeDryRunResult: RuntimeBodyProps['aiRuntimeDryRunResult'];
  aiRuntimeHealthError: RuntimeBodyProps['aiRuntimeHealthError'];
  aiRuntimeHealthGeneratedAt: RuntimeBodyProps['aiRuntimeHealthGeneratedAt'];
  aiRuntimeHealthLevel: Parameters<typeof healthBadgeClass>[0];
  aiRuntimeProviders: RuntimeBodyProps['aiRuntimeProviders'];
  aiRuntimeRoleStatesBase: RuntimeBodyProps['aiRuntimeRoleStates'];
  aiRuntimeSummary: RuntimeBodyProps['aiRuntimeSummary'];
  aiTimeoutMs: RuntimeBodyProps['aiTimeoutMs'];
  appliedGatewayChannelFilter: GatewayTelemetryBodyProps['appliedGatewayChannelFilter'];
  appliedGatewayProviderFilter: GatewayTelemetryBodyProps['appliedGatewayProviderFilter'];
  appliedGatewaySessionChannelFilter: GatewayLiveBodyProps['appliedGatewaySessionChannelFilter'];
  appliedGatewaySessionProviderFilter: GatewayLiveBodyProps['appliedGatewaySessionProviderFilter'];
  appliedGatewaySessionStatusInputValue: GatewayLiveBodyProps['appliedGatewaySessionStatusInputValue'];
  appliedGatewaySessionStatusLabel: string;
  closeInfoMessage: GatewayLiveBodyProps['closeInfoMessage'];
  compactInfoMessage: GatewayLiveBodyProps['compactInfoMessage'];
  density: {
    comfort?: number | null;
    compact?: number | null;
    unknown?: number | null;
  };
  densityTotal: number;
  engagementAvgSessionSeconds: EngagementOverviewProps['engagementAvgSessionSeconds'];
  engagementHealthSignals: EngagementHealthProps['signals'];
  engagementSessionCount: EngagementOverviewProps['engagementSessionCount'];
  eventQuery: GatewayLiveBodyProps['eventQuery'];
  eventsLimit: GatewayLiveBodyProps['eventsLimit'];
  eventTypeFilter: GatewayLiveBodyProps['eventTypeFilter'];
  gatewayChannelFilter: string | null;
  gatewayCompactionHourlyTrend: ComponentProps<
    typeof GatewayCompactionHourlyTrendCard
  >['items'];
  gatewayError: GatewayLiveBodyProps['gatewayError'];
  gatewayEventCounters: GatewayTelemetryBodyProps['eventCounters'];
  gatewayHealthLevel: Parameters<typeof healthBadgeClass>[0];
  gatewayOverview: GatewayLiveBodyProps['gatewayOverview'];
  gatewayProviderFilter: string | null;
  gatewayRecentEvents: GatewayLiveBodyProps['gatewayRecentEvents'];
  gatewayRiskSignalsView: GatewayTelemetryBodyProps['riskSignals'];
  gatewayScopeOverridesApplied: GatewayTelemetryBodyProps['gatewayScopeOverridesApplied'];
  gatewayScopeRows: GatewayTelemetryBodyProps['gatewayScopeRows'];
  gatewaySessionScopeLabel: GatewayLiveBodyProps['gatewaySessionScopeLabel'];
  gatewaySessions: GatewayLiveBodyProps['gatewaySessions'];
  gatewaySessionsSource: GatewayLiveBodyProps['gatewaySessionsSource'];
  gatewaySourceFilter: string | null;
  gatewayStatusFilter: string | null;
  gatewayTelemetry: unknown;
  gatewayTelemetryChannelUsage: ComponentProps<
    typeof BreakdownListCard
  >['items'];
  gatewayTelemetryError: GatewayTelemetryBodyProps['telemetryError'];
  gatewayTelemetryProviderUsage: ComponentProps<
    typeof BreakdownListCard
  >['items'];
  gatewayTelemetrySessions: {
    attention?: unknown;
  };
  gatewayTelemetryStatCards: GatewayTelemetryBodyProps['statCards'];
  gatewayTelemetryThresholds: ComponentProps<
    typeof GatewayTelemetryThresholdsCard
  >['thresholds'];
  hint: {
    dismissCount?: number | null;
    switchCount?: number | null;
  };
  hintInteractionTotal: number;
  kpis: {
    densityComfortRate?: number | null;
    densityCompactRate?: number | null;
    digestOpenRate?: number | null;
    followRate?: number | null;
    hintDismissRate?: number | null;
    predictionFilterSwitchShare?: number | null;
    predictionNonDefaultSortRate?: number | null;
    predictionParticipationRate?: number | null;
    predictionSortSwitchShare?: number | null;
    return24h?: number | null;
    viewModeFocusRate?: number | null;
    viewModeObserverRate?: number | null;
  };
  keepRecentValue: GatewayLiveBodyProps['keepRecentValue'];
  multimodalBreakdownRows: MultimodalTelemetrySectionProps['breakdownRows'];
  multimodalGuardrails: {
    invalidQueryErrors?: unknown;
    invalidQueryRate?: unknown;
  };
  multimodalHourlyTrend: ComponentProps<typeof HourlyTrendCard>['items'];
  multimodalOverallLevel: Parameters<typeof healthBadgeClass>[0];
  multimodalStatCards: MultimodalTelemetrySectionProps['multimodalStatCards'];
  predictionAccuracyLevel: Parameters<typeof healthBadgeClass>[0];
  predictionCohortThresholdSummary: PredictionMarketSectionProps['cohortThresholdSummary'];
  predictionCohortsByOutcomeView: PredictionMarketSectionProps['cohortsByOutcomeRows'];
  predictionCohortsByStakeBandView: PredictionMarketSectionProps['cohortsByStakeBandRows'];
  predictionFilterByFilterBreakdown: ComponentProps<
    typeof BreakdownListCard
  >['items'];
  predictionFilterByScopeAndFilter: PredictionMarketSectionProps['scopeFilterMatrixRows'];
  predictionFilterByScopeBreakdown: ComponentProps<
    typeof BreakdownListCard
  >['items'];
  predictionFilterTelemetry: {
    totalSwitches?: unknown;
  };
  predictionHistoryScopeStates: PredictionMarketSectionProps['historyScopeRows'];
  predictionHourlyTrend: ComponentProps<
    typeof PredictionHourlyTrendCard
  >['items'];
  predictionOutcomesBreakdown: ComponentProps<
    typeof BreakdownListCard
  >['items'];
  predictionResolutionWindowThresholds: {
    accuracyRate: {
      criticalBelow: number | null;
      watchBelow: number | null;
    };
    minResolvedPredictions: number;
  };
  predictionSortByScopeAndSort: PredictionMarketSectionProps['scopeSortMatrixRows'];
  predictionSortByScopeBreakdown: ComponentProps<
    typeof BreakdownListCard
  >['items'];
  predictionSortBySortBreakdown: ComponentProps<
    typeof BreakdownListCard
  >['items'];
  predictionSortTelemetry: {
    totalSwitches?: unknown;
  };
  predictionStatCards: PredictionMarketSectionProps['predictionStatCards'];
  predictionTotals: {
    averageStakePoints?: unknown;
    correctPredictions?: unknown;
    resolvedPredictions?: unknown;
  };
  predictionWindow30dView: PredictionMarketSectionProps['window30d'];
  predictionWindow7dView: PredictionMarketSectionProps['window7d'];
  releaseBreakdownRows: ReleaseHealthSectionProps['breakdownRows'];
  releaseHealthAlertCount: number;
  releaseHealthAlertFirstAppearanceCount: number;
  releaseHealthAlertHourlyTrend: ComponentProps<
    typeof ReleaseHealthAlertHourlyTrendCard
  >['items'];
  releaseHealthAlertLatest: {
    runUrl?: string | null;
  } | null;
  releaseHealthAlertLatestReceivedAt: ReleaseHealthSectionProps['releaseLatestReceivedAt'];
  releaseHealthAlertLatestRunLabel: ReleaseHealthSectionProps['releaseLatestRunLabel'];
  releaseHealthAlertRiskLevel: Parameters<typeof healthBadgeClass>[0];
  releaseHealthAlertedRunCount: number;
  resolvedGatewayTelemetryHealthLevel: Parameters<typeof healthBadgeClass>[0];
  selectedSession: GatewayLiveBodyProps['selectedSession'];
  selectedSessionClosed: GatewayLiveBodyProps['selectedSessionClosed'];
  selectedSessionId: GatewayLiveBodyProps['selectedSessionId'];
  shouldCompactEngagementOverview: EngagementOverviewProps['shouldCompact'];
  shouldCompactFeedPreferenceEvents: FeedInteractionCountersProps['shouldCompact'];
  shouldCompactFeedPreferenceKpis: FeedPreferenceKpisProps['shouldCompact'];
  styleFusionCopyRiskLevel: Parameters<typeof healthBadgeClass>[0];
  styleFusionMetrics: StyleFusionMetricsSectionProps['metrics'];
  styleFusionRiskLevel: Parameters<typeof healthBadgeClass>[0];
  topGatewayProvider: GatewayLiveBodyProps['topGatewayProvider'];
  topSegmentsView: TopSegmentsProps['topSegments'];
  viewMode: {
    focus?: number | null;
    observer?: number | null;
    unknown?: number | null;
  };
  viewModeTotal: number;
}

export const buildAdminUxMainPanelsProps = ({
  activePanel,
  aiFailuresCsv,
  aiPrompt,
  aiProvidersCsv,
  aiRole,
  aiRuntimeDryRunErrorMessage,
  aiRuntimeDryRunInfoMessage,
  aiRuntimeDryRunResult,
  aiRuntimeHealthError,
  aiRuntimeHealthGeneratedAt,
  aiRuntimeHealthLevel,
  aiRuntimeProviders,
  aiRuntimeRoleStatesBase,
  aiRuntimeSummary,
  aiTimeoutMs,
  appliedGatewayChannelFilter,
  appliedGatewayProviderFilter,
  appliedGatewaySessionChannelFilter,
  appliedGatewaySessionProviderFilter,
  appliedGatewaySessionStatusInputValue,
  appliedGatewaySessionStatusLabel,
  closeInfoMessage,
  compactInfoMessage,
  density,
  densityTotal,
  engagementAvgSessionSeconds,
  engagementHealthSignals,
  engagementSessionCount,
  eventQuery,
  eventsLimit,
  eventTypeFilter,
  gatewayChannelFilter,
  gatewayCompactionHourlyTrend,
  gatewayError,
  gatewayEventCounters,
  gatewayHealthLevel,
  gatewayOverview,
  gatewayProviderFilter,
  gatewayRecentEvents,
  gatewayRiskSignalsView,
  gatewayScopeOverridesApplied,
  gatewayScopeRows,
  gatewaySessionScopeLabel,
  gatewaySessions,
  gatewaySessionsSource,
  gatewaySourceFilter,
  gatewayStatusFilter,
  gatewayTelemetry,
  gatewayTelemetryChannelUsage,
  gatewayTelemetryError,
  gatewayTelemetryProviderUsage,
  gatewayTelemetrySessions,
  gatewayTelemetryStatCards,
  gatewayTelemetryThresholds,
  hint,
  hintInteractionTotal,
  hours,
  keepRecentValue,
  kpis,
  multimodalBreakdownRows,
  multimodalGuardrails,
  multimodalHourlyTrend,
  multimodalOverallLevel,
  multimodalStatCards,
  predictionAccuracyLevel,
  predictionCohortThresholdSummary,
  predictionCohortsByOutcomeView,
  predictionCohortsByStakeBandView,
  predictionFilterByFilterBreakdown,
  predictionFilterByScopeAndFilter,
  predictionFilterByScopeBreakdown,
  predictionFilterTelemetry,
  predictionHistoryScopeStates,
  predictionHourlyTrend,
  predictionOutcomesBreakdown,
  predictionResolutionWindowThresholds,
  predictionSortByScopeAndSort,
  predictionSortByScopeBreakdown,
  predictionSortBySortBreakdown,
  predictionSortTelemetry,
  predictionStatCards,
  predictionTotals,
  predictionWindow30dView,
  predictionWindow7dView,
  releaseBreakdownRows,
  releaseHealthAlertCount,
  releaseHealthAlertFirstAppearanceCount,
  releaseHealthAlertHourlyTrend,
  releaseHealthAlertLatest,
  releaseHealthAlertLatestReceivedAt,
  releaseHealthAlertLatestRunLabel,
  releaseHealthAlertRiskLevel,
  releaseHealthAlertedRunCount,
  resolvedGatewayTelemetryHealthLevel,
  selectedSession,
  selectedSessionClosed,
  selectedSessionId,
  shouldCompactEngagementOverview,
  shouldCompactFeedPreferenceEvents,
  shouldCompactFeedPreferenceKpis,
  styleFusionCopyRiskLevel,
  styleFusionMetrics,
  styleFusionRiskLevel,
  topGatewayProvider,
  topSegmentsView,
  viewMode,
  viewModeTotal,
}: BuildAdminUxMainPanelsPropsInput): BuiltMainPanelsProps => {
  const buildPanelHref = (panel: AdminUxPanel) =>
    `/admin/ux?hours=${hours}&panel=${panel}`;
  const gatewayDebugStatusLabel = toStringValue(
    gatewayOverview?.session.status ?? selectedSession?.status,
    appliedGatewaySessionStatusLabel,
  );
  const debugPayloadText = buildDebugPayloadText({
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
    releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertLatest,
    releaseHealthAlertedRunCount,
  });
  const debugContextRows = buildDebugContextRows({
    activePanel,
    gatewaySessionScopeLabel,
    gatewaySessionsSource: toStringValue(gatewaySessionsSource, 'n/a'),
    gatewayStatusLabel: gatewayDebugStatusLabel,
    hours,
    releaseRiskLabel: healthLabel(releaseHealthAlertRiskLevel),
    runtimeHealthLabel: toStringValue(aiRuntimeSummary.health, 'n/a'),
    selectedSessionId,
  });
  const debugEventsSampleCount = Array.isArray(gatewayRecentEvents)
    ? gatewayRecentEvents.slice(0, 10).length
    : 0;

  const gatewayPanelsProps: GatewayPanelsProps = {
    gatewayHealthBadgeClassName: healthBadgeClass(gatewayHealthLevel),
    gatewayHealthLabel: healthLabel(gatewayHealthLevel),
    liveBodyProps: {
      activePanel,
      appliedGatewaySessionChannelFilter,
      appliedGatewaySessionProviderFilter,
      appliedGatewaySessionStatusInputValue,
      buildEventsCsv,
      closeInfoMessage,
      compactInfoMessage,
      eventQuery,
      eventsLimit,
      eventTypeFilter,
      gatewayError,
      gatewayOverview,
      gatewayRecentEvents,
      gatewaySessionScopeLabel,
      gatewaySessions,
      gatewaySessionsSource,
      gatewaySourceFilter,
      hours,
      keepRecentValue,
      selectedSession,
      selectedSessionClosed,
      selectedSessionId,
      toDurationText,
      topGatewayProvider,
    },
    showGatewayHealthBadge: gatewayOverview !== null,
    telemetryBodyProps: {
      activePanel,
      appliedGatewayChannelFilter,
      appliedGatewayProviderFilter,
      appliedGatewaySessionStatusInputValue,
      channelUsageCard: (
        <BreakdownListCard
          emptyLabel="No channel usage in current sample."
          items={gatewayTelemetryChannelUsage}
          title="Channel usage (sample)"
        />
      ),
      compactionTrendCard: (
        <GatewayCompactionHourlyTrendCard
          compactEmptyState
          emptyLabel="No compaction events in current sample."
          items={gatewayCompactionHourlyTrend}
          title="Gateway compaction trend (UTC)"
        />
      ),
      eventCounters: gatewayEventCounters,
      eventQuery,
      eventsLimit,
      eventTypeFilter,
      gatewayScopeOverridesApplied,
      gatewayScopeRows,
      gatewaySourceFilter,
      hours,
      providerUsageCard: (
        <BreakdownListCard
          emptyLabel="No provider usage in current sample."
          items={gatewayTelemetryProviderUsage}
          title="Provider usage (sample)"
        />
      ),
      resetScopeHref: buildPanelHref(activePanel),
      riskSignals: gatewayRiskSignalsView,
      selectedSessionId,
      statCards: gatewayTelemetryStatCards,
      telemetryError: gatewayTelemetryError,
      thresholdsCard: (
        <GatewayTelemetryThresholdsCard
          thresholds={gatewayTelemetryThresholds}
        />
      ),
    },
    telemetryHealthBadgeClassName: healthBadgeClass(
      resolvedGatewayTelemetryHealthLevel,
    ),
    telemetryHealthLabel: healthLabel(resolvedGatewayTelemetryHealthLevel),
  };

  const runtimePanelProps: RuntimePanelProps = {
    bodyProps: {
      aiFailuresCsv,
      aiPrompt,
      aiProvidersCsv,
      aiRole,
      aiRuntimeDryRunErrorMessage,
      aiRuntimeDryRunInfoMessage,
      aiRuntimeDryRunResult,
      aiRuntimeHealthError,
      aiRuntimeHealthGeneratedAt,
      aiRuntimeProviders,
      aiRuntimeRoleStates: aiRuntimeRoleStatesBase,
      aiRuntimeSummary,
      aiTimeoutMs,
      hours,
      panel: activePanel,
      roleOptions: [...AI_RUNTIME_ROLES],
      scopeFields: {
        eventQuery,
        eventTypeFilter,
        eventsLimit,
        gatewaySessionStatusInputValue: appliedGatewaySessionStatusInputValue,
        gatewaySourceFilter,
        selectedSessionId,
        sessionChannelFilter: appliedGatewaySessionChannelFilter,
        sessionProviderFilter: appliedGatewaySessionProviderFilter,
      },
    },
    runtimeHealthBadgeClassName: healthBadgeClass(aiRuntimeHealthLevel),
    runtimeHealthLabel: healthLabel(aiRuntimeHealthLevel),
  };

  const engagementOverviewProps: EngagementOverviewProps = {
    digestOpenRateText: toRateText(kpis.digestOpenRate),
    engagementAvgSessionSeconds,
    engagementSessionCount,
    followRateText: toRateText(kpis.followRate),
    return24hRateText: toRateText(kpis.return24h),
    shouldCompact: shouldCompactEngagementOverview,
  };

  const engagementHealthProps: EngagementHealthProps = {
    signals: engagementHealthSignals,
  };

  const releaseHealthSectionProps: ReleaseHealthSectionProps = {
    breakdownRows: releaseBreakdownRows,
    hourlyTrendCard: (
      <ReleaseHealthAlertHourlyTrendCard
        compactEmptyState
        emptyLabel="No release-health alert hourly trend data in current window."
        items={releaseHealthAlertHourlyTrend}
        title="Release-health alert hourly trend (UTC)"
      />
    ),
    releaseAlertsCount: `${releaseHealthAlertCount}`,
    releaseFirstAppearancesCount: `${releaseHealthAlertFirstAppearanceCount}`,
    releaseLatestReceivedAt: releaseHealthAlertLatestReceivedAt,
    releaseLatestRunLabel: releaseHealthAlertLatestRunLabel,
    releaseLatestRunUrl:
      typeof releaseHealthAlertLatest?.runUrl === 'string'
        ? releaseHealthAlertLatest.runUrl
        : null,
    releaseRiskBadgeClassName: healthBadgeClass(releaseHealthAlertRiskLevel),
    releaseRiskLabel: healthLabel(releaseHealthAlertRiskLevel),
    releaseRunsCount: `${releaseHealthAlertedRunCount}`,
  };

  const feedPreferenceKpisProps: FeedPreferenceKpisProps = {
    comfortDensityShareText: toRateText(kpis.densityComfortRate),
    compactDensityShareText: toRateText(kpis.densityCompactRate),
    hintDismissRateText: toRateText(kpis.hintDismissRate),
    legacyFocusShareText: toRateText(kpis.viewModeFocusRate),
    observerModeShareText: toRateText(kpis.viewModeObserverRate),
    shouldCompact: shouldCompactFeedPreferenceKpis,
  };

  const multimodalTelemetrySectionProps: MultimodalTelemetrySectionProps = {
    breakdownRows: multimodalBreakdownRows,
    coverageRiskBadgeClassName: healthBadgeClass(multimodalOverallLevel),
    coverageRiskLabel: healthLabel(multimodalOverallLevel),
    hourlyTrendCard: (
      <HourlyTrendCard
        compactEmptyState
        emptyLabel="No hourly multimodal trend data in current window."
        items={multimodalHourlyTrend}
        title="Hourly trend (UTC)"
      />
    ),
    invalidQueryErrorsValue: `${toNumber(multimodalGuardrails.invalidQueryErrors)}`,
    invalidQueryShareText: toRateText(multimodalGuardrails.invalidQueryRate),
    multimodalStatCards,
  };

  const predictionMarketSectionProps: PredictionMarketSectionProps = {
    accuracyBadgeClassName: healthBadgeClass(predictionAccuracyLevel),
    accuracyLabel: healthLabel(predictionAccuracyLevel),
    averageStakeText: toFixedText(predictionTotals.averageStakePoints),
    cohortThresholdSummary: predictionCohortThresholdSummary,
    cohortsByOutcomeRows: predictionCohortsByOutcomeView,
    cohortsByStakeBandRows: predictionCohortsByStakeBandView,
    correctPredictions: toNumber(predictionTotals.correctPredictions),
    filterScopeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No scope-switch data in current window."
        items={predictionFilterByScopeBreakdown}
        title="Filter scope mix"
      />
    ),
    filterSwitchesValue: `${toNumber(predictionFilterTelemetry.totalSwitches)}`,
    filterSwitchShareText: toRateText(kpis.predictionFilterSwitchShare),
    filterValueMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No filter-value data in current window."
        items={predictionFilterByFilterBreakdown}
        title="Filter value mix"
      />
    ),
    historyScopeRows: predictionHistoryScopeStates,
    hourlyTrendCard: (
      <PredictionHourlyTrendCard
        compactEmptyState
        emptyLabel="No hourly prediction trend data in current window."
        items={predictionHourlyTrend}
        title="Prediction hourly trend (UTC)"
      />
    ),
    nonDefaultSortShareText: toRateText(kpis.predictionNonDefaultSortRate),
    outcomeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No prediction outcomes in current window."
        items={predictionOutcomesBreakdown}
        title="Outcome mix"
      />
    ),
    participationRateText: toRateText(kpis.predictionParticipationRate),
    predictionStatCards,
    resolvedPredictions: toNumber(predictionTotals.resolvedPredictions),
    scopeFilterMatrixRows: predictionFilterByScopeAndFilter,
    scopeSortMatrixRows: predictionSortByScopeAndSort,
    sortScopeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No sort scope data in current window."
        items={predictionSortByScopeBreakdown}
        title="Sort scope mix"
      />
    ),
    sortSwitchesValue: `${toNumber(predictionSortTelemetry.totalSwitches)}`,
    sortSwitchShareText: toRateText(kpis.predictionSortSwitchShare),
    sortValueMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No sort-value data in current window."
        items={predictionSortBySortBreakdown}
        title="Sort value mix"
      />
    ),
    window30d: predictionWindow30dView,
    window7d: predictionWindow7dView,
    windowThresholdCriticalText: toRateText(
      predictionResolutionWindowThresholds.accuracyRate.criticalBelow,
    ),
    windowThresholdMinSample:
      predictionResolutionWindowThresholds.minResolvedPredictions,
    windowThresholdWatchText: toRateText(
      predictionResolutionWindowThresholds.accuracyRate.watchBelow,
    ),
  };

  const styleFusionMetricsSectionProps: StyleFusionMetricsSectionProps = {
    copyRiskBadgeClassName: healthBadgeClass(styleFusionCopyRiskLevel),
    copyRiskLabel: healthLabel(styleFusionCopyRiskLevel),
    fusionRiskBadgeClassName: healthBadgeClass(styleFusionRiskLevel),
    fusionRiskLabel: healthLabel(styleFusionRiskLevel),
    metrics: styleFusionMetrics,
  };

  const debugDiagnosticsSectionProps: DebugDiagnosticsSectionProps = {
    attentionSessionsCount: `${toNumber(gatewayTelemetrySessions.attention)}`,
    debugContextRows,
    debugPayloadText,
    eventsSampleCount: debugEventsSampleCount,
    releaseAlertsCount: `${releaseHealthAlertCount}`,
    runtimeProvidersCount: aiRuntimeProviders.length,
  };

  const feedInteractionCountersProps: FeedInteractionCountersProps = {
    density: {
      comfort: toNumber(density.comfort),
      compact: toNumber(density.compact),
      total: densityTotal,
      unknown: toNumber(density.unknown),
    },
    hint: {
      dismissCount: toNumber(hint.dismissCount),
      switchCount: toNumber(hint.switchCount),
      total: hintInteractionTotal,
    },
    shouldCompact: shouldCompactFeedPreferenceEvents,
    viewMode: {
      focus: toNumber(viewMode.focus),
      observer: toNumber(viewMode.observer),
      total: viewModeTotal,
      unknown: toNumber(viewMode.unknown),
    },
  };

  const topSegmentsProps: TopSegmentsProps = {
    shouldCompactFeedPreferenceEvents,
    topSegments: topSegmentsView,
  };

  return {
    debugDiagnosticsSectionProps,
    engagementHealthProps,
    engagementOverviewProps,
    feedInteractionCountersProps,
    feedPreferenceKpisProps,
    gatewayPanelsProps,
    multimodalTelemetrySectionProps,
    predictionMarketSectionProps,
    releaseHealthSectionProps,
    runtimePanelProps,
    styleFusionMetricsSectionProps,
    topSegmentsProps,
  };
};
