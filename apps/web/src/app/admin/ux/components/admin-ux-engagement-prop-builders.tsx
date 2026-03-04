import type {
  BuiltMainPanelsProps,
  EngagementPanelsBuilderInput,
} from './admin-ux-main-panel-builder-types';
import {
  healthBadgeClass,
  healthLabel,
  toFixedText,
  toNumber,
  toRateText,
} from './admin-ux-mappers';
import {
  BreakdownListCard,
  HourlyTrendCard,
  PredictionHourlyTrendCard,
  ReleaseHealthAlertHourlyTrendCard,
} from './telemetry-shared-cards';

type EngagementDomainPanelsProps = Pick<
  BuiltMainPanelsProps,
  | 'engagementHealthProps'
  | 'engagementOverviewProps'
  | 'feedInteractionCountersProps'
  | 'feedPreferenceKpisProps'
  | 'multimodalTelemetrySectionProps'
  | 'predictionMarketSectionProps'
  | 'releaseHealthSectionProps'
  | 'styleFusionMetricsSectionProps'
  | 'topSegmentsProps'
>;

export const buildEngagementDomainPanelsProps = ({
  sectionData,
}: EngagementPanelsBuilderInput): EngagementDomainPanelsProps => ({
  engagementOverviewProps: {
    digestOpenRateText: toRateText(sectionData.kpis.digestOpenRate),
    engagementAvgSessionSeconds: sectionData.engagementAvgSessionSeconds,
    engagementSessionCount: sectionData.engagementSessionCount,
    followRateText: toRateText(sectionData.kpis.followRate),
    return24hRateText: toRateText(sectionData.kpis.return24h),
    shouldCompact: sectionData.shouldCompactEngagementOverview,
  },
  engagementHealthProps: {
    signals: sectionData.engagementHealthSignals,
  },
  releaseHealthSectionProps: {
    breakdownRows: sectionData.releaseBreakdownRows,
    hourlyTrendCard: (
      <ReleaseHealthAlertHourlyTrendCard
        compactEmptyState
        emptyLabel="No release-health alert hourly trend data in current window."
        items={sectionData.releaseHealthAlertHourlyTrend}
        title="Release-health alert hourly trend (UTC)"
      />
    ),
    releaseAlertsCount: `${sectionData.releaseHealthAlertCount}`,
    releaseFirstAppearancesCount: `${sectionData.releaseHealthAlertFirstAppearanceCount}`,
    releaseLatestReceivedAt: sectionData.releaseHealthAlertLatestReceivedAt,
    releaseLatestRunLabel: sectionData.releaseHealthAlertLatestRunLabel,
    releaseLatestRunUrl:
      typeof sectionData.releaseHealthAlertLatest?.runUrl === 'string'
        ? sectionData.releaseHealthAlertLatest.runUrl
        : null,
    releaseRiskBadgeClassName: healthBadgeClass(
      sectionData.releaseHealthAlertRiskLevel,
    ),
    releaseRiskLabel: healthLabel(sectionData.releaseHealthAlertRiskLevel),
    releaseRunsCount: `${sectionData.releaseHealthAlertedRunCount}`,
  },
  feedPreferenceKpisProps: {
    comfortDensityShareText: toRateText(sectionData.kpis.densityComfortRate),
    compactDensityShareText: toRateText(sectionData.kpis.densityCompactRate),
    hintDismissRateText: toRateText(sectionData.kpis.hintDismissRate),
    legacyFocusShareText: toRateText(sectionData.kpis.viewModeFocusRate),
    observerModeShareText: toRateText(sectionData.kpis.viewModeObserverRate),
    shouldCompact: sectionData.shouldCompactFeedPreferenceKpis,
  },
  multimodalTelemetrySectionProps: {
    breakdownRows: sectionData.multimodalBreakdownRows,
    coverageRiskBadgeClassName: healthBadgeClass(
      sectionData.multimodalOverallLevel,
    ),
    coverageRiskLabel: healthLabel(sectionData.multimodalOverallLevel),
    hourlyTrendCard: (
      <HourlyTrendCard
        compactEmptyState
        emptyLabel="No hourly multimodal trend data in current window."
        items={sectionData.multimodalHourlyTrend}
        title="Hourly trend (UTC)"
      />
    ),
    invalidQueryErrorsValue: `${toNumber(
      sectionData.multimodalGuardrails.invalidQueryErrors,
    )}`,
    invalidQueryShareText: toRateText(
      sectionData.multimodalGuardrails.invalidQueryRate,
    ),
    multimodalStatCards: sectionData.multimodalStatCards,
  },
  predictionMarketSectionProps: {
    accuracyBadgeClassName: healthBadgeClass(
      sectionData.predictionAccuracyLevel,
    ),
    accuracyLabel: healthLabel(sectionData.predictionAccuracyLevel),
    averageStakeText: toFixedText(
      sectionData.predictionTotals.averageStakePoints,
    ),
    cohortThresholdSummary: sectionData.predictionCohortThresholdSummary,
    cohortsByOutcomeRows: sectionData.predictionCohortsByOutcomeView,
    cohortsByStakeBandRows: sectionData.predictionCohortsByStakeBandView,
    correctPredictions: toNumber(
      sectionData.predictionTotals.correctPredictions,
    ),
    filterScopeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No scope-switch data in current window."
        items={sectionData.predictionFilterByScopeBreakdown}
        title="Filter scope mix"
      />
    ),
    filterSwitchesValue: `${toNumber(
      sectionData.predictionFilterTelemetry.totalSwitches,
    )}`,
    filterSwitchShareText: toRateText(
      sectionData.kpis.predictionFilterSwitchShare,
    ),
    filterValueMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No filter-value data in current window."
        items={sectionData.predictionFilterByFilterBreakdown}
        title="Filter value mix"
      />
    ),
    historyScopeRows: sectionData.predictionHistoryScopeStates,
    hourlyTrendCard: (
      <PredictionHourlyTrendCard
        compactEmptyState
        emptyLabel="No hourly prediction trend data in current window."
        items={sectionData.predictionHourlyTrend}
        title="Prediction hourly trend (UTC)"
      />
    ),
    nonDefaultSortShareText: toRateText(
      sectionData.kpis.predictionNonDefaultSortRate,
    ),
    outcomeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No prediction outcomes in current window."
        items={sectionData.predictionOutcomesBreakdown}
        title="Outcome mix"
      />
    ),
    participationRateText: toRateText(
      sectionData.kpis.predictionParticipationRate,
    ),
    predictionStatCards: sectionData.predictionStatCards,
    resolvedPredictions: toNumber(
      sectionData.predictionTotals.resolvedPredictions,
    ),
    scopeFilterMatrixRows: sectionData.predictionFilterByScopeAndFilter,
    scopeSortMatrixRows: sectionData.predictionSortByScopeAndSort,
    sortScopeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No sort scope data in current window."
        items={sectionData.predictionSortByScopeBreakdown}
        title="Sort scope mix"
      />
    ),
    sortSwitchesValue: `${toNumber(sectionData.predictionSortTelemetry.totalSwitches)}`,
    sortSwitchShareText: toRateText(sectionData.kpis.predictionSortSwitchShare),
    sortValueMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No sort-value data in current window."
        items={sectionData.predictionSortBySortBreakdown}
        title="Sort value mix"
      />
    ),
    window30d: sectionData.predictionWindow30dView,
    window7d: sectionData.predictionWindow7dView,
    windowThresholdCriticalText: toRateText(
      sectionData.predictionResolutionWindowThresholds.accuracyRate
        .criticalBelow,
    ),
    windowThresholdMinSample:
      sectionData.predictionResolutionWindowThresholds.minResolvedPredictions,
    windowThresholdWatchText: toRateText(
      sectionData.predictionResolutionWindowThresholds.accuracyRate.watchBelow,
    ),
  },
  styleFusionMetricsSectionProps: {
    copyRiskBadgeClassName: healthBadgeClass(
      sectionData.styleFusionCopyRiskLevel,
    ),
    copyRiskLabel: healthLabel(sectionData.styleFusionCopyRiskLevel),
    fusionRiskBadgeClassName: healthBadgeClass(
      sectionData.styleFusionRiskLevel,
    ),
    fusionRiskLabel: healthLabel(sectionData.styleFusionRiskLevel),
    metrics: sectionData.styleFusionMetrics,
  },
  feedInteractionCountersProps: {
    density: {
      comfort: toNumber(sectionData.density.comfort),
      compact: toNumber(sectionData.density.compact),
      total: sectionData.densityTotal,
      unknown: toNumber(sectionData.density.unknown),
    },
    hint: {
      dismissCount: toNumber(sectionData.hint.dismissCount),
      switchCount: toNumber(sectionData.hint.switchCount),
      total: sectionData.hintInteractionTotal,
    },
    shouldCompact: sectionData.shouldCompactFeedPreferenceEvents,
    viewMode: {
      focus: toNumber(sectionData.viewMode.focus),
      observer: toNumber(sectionData.viewMode.observer),
      total: sectionData.viewModeTotal,
      unknown: toNumber(sectionData.viewMode.unknown),
    },
  },
  topSegmentsProps: {
    shouldCompactFeedPreferenceEvents:
      sectionData.shouldCompactFeedPreferenceEvents,
    topSegments: sectionData.topSegmentsView,
  },
});
