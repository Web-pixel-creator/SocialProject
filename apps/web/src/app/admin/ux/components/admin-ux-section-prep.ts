import type {
  AgentGatewayOverview,
  AgentGatewayTelemetryResponse,
  ObserverEngagementResponse,
  SimilarSearchMetricsResponse,
  VerificationMetricsResponse,
} from './admin-ux-data-client';
import {
  deriveReleaseHealthAlertRiskLevel,
  type HealthLevel,
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
  verificationMetrics: VerificationMetricsResponse | null;
}

const combineHealthLevels = (levels: HealthLevel[]): HealthLevel => {
  if (levels.includes('critical')) {
    return 'critical';
  }
  if (levels.includes('watch')) {
    return 'watch';
  }
  if (levels.includes('healthy')) {
    return 'healthy';
  }
  return 'unknown';
};

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
  verificationMetrics,
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
  const verificationSummary =
    verificationMetrics?.summary &&
    typeof verificationMetrics.summary === 'object'
      ? verificationMetrics.summary
      : {};
  const verificationTelemetry =
    verificationMetrics?.telemetry &&
    typeof verificationMetrics.telemetry === 'object'
      ? verificationMetrics.telemetry
      : {};
  const verificationByMethod =
    verificationMetrics?.byMethod &&
    typeof verificationMetrics.byMethod === 'object'
      ? verificationMetrics.byMethod
      : {};
  const verificationTotalAgents = toNumber(verificationSummary.totalAgents);
  const verificationVerifiedAgents = toNumber(
    verificationSummary.verifiedAgents,
  );
  const verificationUnverifiedAgents = toNumber(
    verificationSummary.unverifiedAgents,
  );
  const verificationTotalClaims = toNumber(verificationSummary.totalClaims);
  const verificationPendingClaims = toNumber(verificationSummary.pendingClaims);
  const verificationExpiredClaims = toNumber(verificationSummary.expiredClaims);
  const verificationRate = pickFirstFiniteRate(
    verificationSummary.verificationRate,
  );
  const verificationAvgHoursToVerify = pickFirstFiniteRate(
    verificationSummary.avgHoursToVerify,
  );
  const verificationClaimCreatedCount = toNumber(
    verificationTelemetry.claimCreatedCount,
  );
  const verificationClaimVerifiedCount = toNumber(
    verificationTelemetry.claimVerifiedCount,
  );
  const verificationClaimFailedCount = toNumber(
    verificationTelemetry.claimFailedCount,
  );
  const verificationBlockedActionCount = toNumber(
    verificationTelemetry.blockedActionCount,
  );
  const verificationFailureReasons = Array.isArray(
    verificationTelemetry.failureReasons,
  )
    ? verificationTelemetry.failureReasons.map((entry, index) => {
        const row = entry && typeof entry === 'object' ? entry : {};
        return {
          errorCode:
            typeof (row as { errorCode?: unknown }).errorCode === 'string' &&
            (row as { errorCode: string }).errorCode.trim().length > 0
              ? (row as { errorCode: string }).errorCode
              : `unknown-${index + 1}`,
          count: toNumber((row as { count?: unknown }).count),
        };
      })
    : [];
  const verificationMethodRows = (['email', 'x'] as const).map((method) => {
    const row =
      verificationByMethod[method] &&
      typeof verificationByMethod[method] === 'object'
        ? verificationByMethod[method]
        : {};
    return {
      method,
      label: method === 'email' ? 'Email' : 'X',
      totalClaims: toNumber(row.totalClaims),
      pendingClaims: toNumber(row.pendingClaims),
      verifiedClaims: toNumber(row.verifiedClaims),
      expiredClaims: toNumber(row.expiredClaims),
    };
  });
  const verificationFailureRate =
    verificationClaimCreatedCount > 0
      ? Number(
          (
            verificationClaimFailedCount / verificationClaimCreatedCount
          ).toFixed(3),
        )
      : null;
  const verificationBlockedActionRate =
    verificationClaimCreatedCount > 0
      ? Number(
          (
            verificationBlockedActionCount / verificationClaimCreatedCount
          ).toFixed(3),
        )
      : null;
  const verificationExpiredRate =
    verificationTotalClaims > 0
      ? Number((verificationExpiredClaims / verificationTotalClaims).toFixed(3))
      : null;
  const verificationRiskLevel =
    verificationTotalAgents === 0 && verificationTotalClaims === 0
      ? 'unknown'
      : combineHealthLevels([
          resolveHealthLevel(verificationRate, {
            criticalBelow: 0.35,
            watchBelow: 0.55,
          }),
          resolveRiskHealthLevel(verificationFailureRate, {
            criticalAbove: 0.35,
            watchAbove: 0.15,
          }),
          resolveRiskHealthLevel(verificationBlockedActionRate, {
            criticalAbove: 0.3,
            watchAbove: 0.15,
          }),
          resolveRiskHealthLevel(verificationExpiredRate, {
            criticalAbove: 0.3,
            watchAbove: 0.15,
          }),
        ]);
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
    verificationAvgHoursToVerify,
    verificationBlockedActionCount,
    verificationBlockedActionRate,
    verificationClaimCreatedCount,
    verificationClaimFailedCount,
    verificationClaimVerifiedCount,
    verificationExpiredClaims,
    verificationFailureRate,
    verificationFailureReasons,
    verificationMethodRows,
    verificationPendingClaims,
    verificationRate,
    verificationRiskLevel,
    verificationTotalAgents,
    verificationTotalClaims,
    verificationUnverifiedAgents,
    verificationVerifiedAgents,
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
