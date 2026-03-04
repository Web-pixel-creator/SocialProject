import type {
  AgentGatewayOverview,
  AgentGatewayTelemetryResponse,
  ObserverEngagementResponse,
  SimilarSearchMetricsResponse,
} from './admin-ux-data-client';
import {
  deriveReleaseHealthAlertRiskLevel,
  healthBadgeClass,
  healthLabel,
  normalizeBreakdownItems,
  normalizeGatewayCompactionHourlyTrendItems,
  normalizeGatewayTelemetryFilters,
  normalizeGatewayTelemetryThresholds,
  normalizeHourlyTrendItems,
  normalizePredictionCohortByOutcomeItems,
  normalizePredictionCohortByStakeBandItems,
  normalizePredictionCohortRiskThresholds,
  normalizePredictionFilterScopeFilterItems,
  normalizePredictionHistoryScopeStateItems,
  normalizePredictionHourlyTrendItems,
  normalizePredictionResolutionWindow,
  normalizePredictionResolutionWindowThresholds,
  normalizePredictionSortScopeSortItems,
  normalizeReleaseHealthAlertHourlyTrendItems,
  normalizeStyleFusionMetrics,
  pickFirstFiniteRate,
  resolveGatewaySessionScope,
  resolveGatewayTelemetryHealthLevel,
  resolveHealthLevel,
  resolvePredictionCohortHealthLevel,
  resolvePredictionResolutionWindowHealthLevel,
  resolveRiskHealthLevel,
  toHealthLevelValue,
  toNullableIsoTimestamp,
  toNumber,
  toRateText,
} from './admin-ux-mappers';
import { formatPredictionOutcomeMetricLabel } from './admin-ux-page-utils';
import {
  buildEngagementCompactionView,
  buildEngagementHealthSignals,
  buildGatewayEventCounters,
  buildGatewayRiskSignalsView,
  buildGatewayScopeRows,
  buildGatewayTelemetryStatCards,
  buildGatewayTelemetryView,
  buildMultimodalBreakdownRows,
  buildMultimodalStatCards,
  buildMultimodalTelemetryView,
  buildPredictionCohortsByOutcomeView,
  buildPredictionCohortsByStakeBandView,
  buildPredictionMarketTelemetryView,
  buildPredictionStatCards,
  buildPredictionWindowView,
  buildReleaseBreakdownRows,
  buildReleaseHealthAlertsView,
  buildTopSegmentsView,
} from './admin-ux-view-models';

interface GatewaySessionFilters {
  channel: string | null;
  provider: string | null;
  status: string | null;
}

export interface PrepareAdminUxSectionDataInput {
  data: ObserverEngagementResponse | null;
  gatewayChannelFilter: string | null;
  gatewayOverview: AgentGatewayOverview | null;
  gatewayProviderFilter: string | null;
  gatewaySessionFilters: GatewaySessionFilters;
  gatewaySourceFilter: string | null;
  gatewayStatusFilter: string | null;
  gatewayTelemetry: AgentGatewayTelemetryResponse | null;
  similarSearchMetrics: SimilarSearchMetricsResponse | null;
}

export const prepareAdminUxSectionData = ({
  data,
  gatewayChannelFilter,
  gatewayOverview,
  gatewayProviderFilter,
  gatewaySessionFilters,
  gatewaySourceFilter,
  gatewayStatusFilter,
  gatewayTelemetry,
  similarSearchMetrics,
}: PrepareAdminUxSectionDataInput) => {
  const kpis = data?.kpis ?? {};
  const predictionMarket = data?.predictionMarket ?? {};
  const predictionFilterTelemetry = data?.predictionFilterTelemetry ?? {};
  const predictionSortTelemetry = data?.predictionSortTelemetry ?? {};
  const predictionHistoryStateTelemetry =
    data?.predictionHistoryStateTelemetry ?? {};
  const {
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
  } = buildPredictionMarketTelemetryView({
    formatPredictionOutcomeMetricLabel,
    normalizeBreakdownItems,
    normalizePredictionCohortByOutcomeItems,
    normalizePredictionCohortByStakeBandItems,
    normalizePredictionCohortRiskThresholds,
    normalizePredictionFilterScopeFilterItems,
    normalizePredictionHistoryScopeStateItems,
    normalizePredictionHourlyTrendItems,
    normalizePredictionResolutionWindow,
    normalizePredictionResolutionWindowThresholds,
    normalizePredictionSortScopeSortItems,
    predictionFilterTelemetry,
    predictionHistoryStateTelemetry,
    predictionMarket,
    predictionSortTelemetry,
    resolvePredictionCohortHealthLevel,
    resolvePredictionResolutionWindowHealthLevel,
    toRateText,
  });
  const multimodal = data?.multimodal ?? {};
  const {
    multimodalCoverageRate,
    multimodalEmptyReasonBreakdown,
    multimodalErrorRate,
    multimodalErrorReasonBreakdown,
    multimodalGuardrails,
    multimodalHourlyTrend,
    multimodalOverallLevel,
    multimodalProviderBreakdown,
  } = buildMultimodalTelemetryView({
    kpis,
    multimodal,
    normalizeBreakdownItems,
    normalizeHourlyTrendItems,
    pickFirstFiniteRate,
    resolveHealthLevel,
    resolveRiskHealthLevel,
  });
  const releaseHealthAlerts = data?.releaseHealthAlerts ?? {};
  const {
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
  } = buildReleaseHealthAlertsView({
    deriveReleaseHealthAlertRiskLevel,
    kpis,
    normalizeBreakdownItems,
    normalizeReleaseHealthAlertHourlyTrendItems,
    releaseHealthAlerts,
    toNullableIsoTimestamp,
    toNumber,
  });
  const feedPreferences = data?.feedPreferences ?? {};
  const viewMode = feedPreferences.viewMode ?? {};
  const density = feedPreferences.density ?? {};
  const hint = feedPreferences.hint ?? {};
  const {
    densityTotal,
    engagementAvgSessionSeconds,
    engagementSessionCount,
    hintInteractionTotal,
    shouldCompactEngagementOverview,
    shouldCompactFeedPreferenceEvents,
    shouldCompactFeedPreferenceKpis,
    viewModeTotal,
  } = buildEngagementCompactionView({
    feedPreferences,
    kpis,
    toNumber,
  });
  const segments = Array.isArray(data?.segments) ? data?.segments : [];
  const styleFusionMetrics = normalizeStyleFusionMetrics(similarSearchMetrics);
  const styleFusionRiskLevel = resolveHealthLevel(
    styleFusionMetrics.successRate,
    {
      criticalBelow: 0.5,
      watchBelow: 0.7,
    },
  );
  const styleFusionCopyRiskLevel = resolveHealthLevel(
    styleFusionMetrics.copy.successRate,
    {
      criticalBelow: 0.6,
      watchBelow: 0.8,
    },
  );
  const topSegmentsView = buildTopSegmentsView({ segments, toNumber });
  const gatewayProviders = gatewayOverview
    ? Object.entries(gatewayOverview.summary.providerUsage).sort(
        (left, right) => right[1] - left[1],
      )
    : [];
  const topGatewayProvider = gatewayProviders[0] ?? null;
  const {
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
  } = buildGatewayTelemetryView({
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
  });
  const engagementHealthSignals = buildEngagementHealthSignals({
    healthBadgeClass,
    healthLabel,
    kpis,
    resolveHealthLevel,
    toRateText,
  });
  const releaseBreakdownRows = buildReleaseBreakdownRows({
    byChannel: releaseHealthAlertByChannel,
    byFailureMode: releaseHealthAlertByFailureMode,
  });
  const multimodalBreakdownRows = buildMultimodalBreakdownRows({
    emptyReasonBreakdown: multimodalEmptyReasonBreakdown,
    errorReasonBreakdown: multimodalErrorReasonBreakdown,
    providerBreakdown: multimodalProviderBreakdown,
  });
  const multimodalStatCards = buildMultimodalStatCards({
    multimodal,
    multimodalCoverageRate,
    multimodalErrorRate,
    toNumber,
    toRateText,
  });
  const gatewayRiskSignalsView = buildGatewayRiskSignalsView({
    autoCompactionLevel: gatewayAutoCompactionShareLevel,
    cooldownSkipLevel: gatewayCooldownSkipLevel,
    failedStepLevel: gatewayFailedStepLevel,
    healthBadgeClass,
    healthLabel,
    runtimeSuccessLevel: gatewayRuntimeSuccessLevel,
  });
  const gatewayScopeOverridesApplied =
    (gatewaySourceFilter ?? '').length > 0 ||
    (appliedGatewayChannelFilter ?? '').length > 0 ||
    (appliedGatewayProviderFilter ?? '').length > 0 ||
    (appliedGatewaySessionStatusInputValue ?? '').length > 0;
  const gatewayScopeRows = buildGatewayScopeRows({
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionStatusLabel,
    gatewaySourceFilter,
  });
  const gatewayTelemetryStatCards = buildGatewayTelemetryStatCards({
    attempts: gatewayTelemetryAttempts,
    events: gatewayTelemetryEvents,
    sessions: gatewayTelemetrySessions,
    toNumber,
    toRateText,
  });
  const gatewayEventCounters = buildGatewayEventCounters({
    events: gatewayTelemetryEvents,
    toNumber,
  });
  const predictionAccuracyLevel = resolveHealthLevel(
    kpis.predictionAccuracyRate,
    {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
  );
  const predictionStatCards = buildPredictionStatCards({
    kpis,
    predictionTotals,
    toNumber,
    toRateText,
  });
  const predictionWindow7dView = buildPredictionWindowView({
    healthBadgeClass,
    healthLabel,
    riskLevel: predictionWindow7dRiskLevel,
    toRateText,
    window: predictionWindow7d,
  });
  const predictionWindow30dView = buildPredictionWindowView({
    healthBadgeClass,
    healthLabel,
    riskLevel: predictionWindow30dRiskLevel,
    toRateText,
    window: predictionWindow30d,
  });
  const predictionCohortsByOutcomeView = buildPredictionCohortsByOutcomeView({
    healthBadgeClass,
    healthLabel,
    rows: predictionCohortsByOutcomeWithRisk,
    toOutcomeLabel: formatPredictionOutcomeMetricLabel,
    toRateText,
  });
  const predictionCohortsByStakeBandView =
    buildPredictionCohortsByStakeBandView({
      healthBadgeClass,
      healthLabel,
      rows: predictionCohortsByStakeBandWithRisk,
      toRateText,
    });

  return {
    density,
    densityTotal,
    engagementAvgSessionSeconds,
    engagementHealthSignals,
    engagementSessionCount,
    gatewayEventCounters,
    gatewayRiskSignalsView,
    gatewayScopeOverridesApplied,
    gatewayScopeRows,
    gatewaySessionScopeLabel,
    gatewayTelemetryChannelUsage,
    gatewayTelemetryProviderUsage,
    gatewayTelemetrySessions,
    gatewayTelemetryStatCards,
    gatewayTelemetryThresholds,
    hint,
    hintInteractionTotal,
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
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionChannelFilter,
    appliedGatewaySessionProviderFilter,
    appliedGatewaySessionStatusInputValue,
    appliedGatewaySessionStatusLabel,
    gatewayCompactionHourlyTrend,
  };
};

export type AdminUxSectionData = ReturnType<typeof prepareAdminUxSectionData>;
