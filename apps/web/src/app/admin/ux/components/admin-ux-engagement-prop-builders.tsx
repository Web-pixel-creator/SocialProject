import type {
  BuiltMainPanelsProps,
  EngagementPanelsBuilderInput,
} from './admin-ux-main-panel-builder-types';
import {
  healthBadgeClass,
  healthLabel,
  toDurationText,
  toFixedText,
  toNumber,
  toRateText,
} from './admin-ux-mappers';
import { buildAdminUxPanelHref } from './admin-ux-page-shell-view-model';
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
  | 'verificationSectionProps'
>;

const resolveKnownHealthLevel = (
  value: unknown,
): 'critical' | 'healthy' | 'unknown' | 'watch' => {
  if (
    value === 'critical' ||
    value === 'healthy' ||
    value === 'unknown' ||
    value === 'watch'
  ) {
    return value;
  }
  return 'unknown';
};

export const buildEngagementDomainPanelsProps = ({
  hours,
  latestReleaseObservabilitySnapshot,
  sectionData,
}: EngagementPanelsBuilderInput): EngagementDomainPanelsProps => {
  const latestReleaseRunId =
    typeof sectionData.releaseHealthAlertLatest?.runId === 'number' &&
    Number.isInteger(sectionData.releaseHealthAlertLatest.runId) &&
    sectionData.releaseHealthAlertLatest.runId > 0
      ? String(sectionData.releaseHealthAlertLatest.runId)
      : null;
  const latestReleaseRunUrl =
    typeof sectionData.releaseHealthAlertLatest?.runUrl === 'string' &&
    sectionData.releaseHealthAlertLatest.runUrl.length > 0
      ? sectionData.releaseHealthAlertLatest.runUrl
      : null;
  const latestReleaseObservabilityHealthLevel =
    latestReleaseObservabilitySnapshot !== null
      ? resolveKnownHealthLevel(
          latestReleaseObservabilitySnapshot.health?.level,
        )
      : sectionData.releaseHealthAlertRiskLevel;
  const latestReleaseObservabilityHttpSummary =
    latestReleaseObservabilitySnapshot?.http?.summary;
  const latestReleaseObservabilityRuntimeSummary =
    latestReleaseObservabilitySnapshot?.runtime?.summary;
  const savedViewLinks = [
    {
      description:
        'Jump to the release-only operator surface for the current window.',
      href: buildAdminUxPanelHref(hours, 'release'),
      label: 'Release alerts',
    },
    {
      description: 'Open all-metrics quality view with risk-only filtering.',
      href: buildAdminUxPanelHref(hours, 'all', {
        allMetricsRiskFilter: 'high',
        allMetricsView: 'quality',
      }),
      label: 'Quality risk-only',
    },
    {
      description:
        'Open the raw telemetry/debug surface without changing the window.',
      href: buildAdminUxPanelHref(hours, 'debug'),
      label: 'Debug telemetry',
    },
    ...(latestReleaseRunId
      ? [
          {
            description:
              'Open debug telemetry already scoped to the latest alerted release run.',
            href: buildAdminUxPanelHref(hours, 'debug', {
              releaseRunId: latestReleaseRunId,
            }),
            label: 'Latest alert drill-down',
          },
        ]
      : []),
  ];
  const latestIncidentCard = latestReleaseRunId
    ? {
        badgeClassName: healthBadgeClass(latestReleaseObservabilityHealthLevel),
        badgeLabel: `Scoped health: ${healthLabel(latestReleaseObservabilityHealthLevel)}`,
        debugHref: buildAdminUxPanelHref(hours, 'debug', {
          releaseRunId: latestReleaseRunId,
        }),
        metrics: [
          {
            label: 'Run',
            value: sectionData.releaseHealthAlertLatestRunLabel,
          },
          {
            label: 'API p95',
            value:
              typeof latestReleaseObservabilityHttpSummary?.p95TimingMs ===
                'number' &&
              Number.isFinite(latestReleaseObservabilityHttpSummary.p95TimingMs)
                ? toDurationText(
                    latestReleaseObservabilityHttpSummary.p95TimingMs,
                  )
                : 'n/a',
          },
          {
            label: 'Correlation',
            value: toRateText(
              latestReleaseObservabilityHttpSummary?.correlationCoverageRate,
            ),
          },
          {
            label: 'Runtime fail',
            value: toRateText(
              latestReleaseObservabilityRuntimeSummary?.failureRate,
            ),
          },
        ],
        qualityHref: buildAdminUxPanelHref(hours, 'all', {
          allMetricsRiskFilter: 'high',
          allMetricsView: 'quality',
        }),
        runHref: latestReleaseRunUrl,
        summary: latestReleaseObservabilitySnapshot
          ? `Scoped observability for ${sectionData.releaseHealthAlertLatestRunLabel} is ready. Use the filtered debug view to move from alert to correlated HTTP/runtime evidence without re-entering the run id.`
          : `Latest alerted run ${sectionData.releaseHealthAlertLatestRunLabel} is available. Open the filtered debug view to scope telemetry to this release run.`,
        title: `Latest alerted run ${sectionData.releaseHealthAlertLatestRunLabel}`,
      }
    : null;
  const formatHoursText = (value: number | null): string =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${value.toFixed(2)}h`
      : 'n/a';

  return {
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
      latestIncidentCard,
      releaseAlertsCount: `${sectionData.releaseHealthAlertCount}`,
      releaseFirstAppearancesCount: `${sectionData.releaseHealthAlertFirstAppearanceCount}`,
      releaseLatestReceivedAt: sectionData.releaseHealthAlertLatestReceivedAt,
      releaseLatestRunLabel: sectionData.releaseHealthAlertLatestRunLabel,
      releaseLatestRunUrl: latestReleaseRunUrl,
      releaseRiskBadgeClassName: healthBadgeClass(
        sectionData.releaseHealthAlertRiskLevel,
      ),
      releaseRiskLabel: healthLabel(sectionData.releaseHealthAlertRiskLevel),
      releaseRunsCount: `${sectionData.releaseHealthAlertedRunCount}`,
      savedViewLinks,
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
      invalidQueryErrorsValue: `${toNumber(sectionData.multimodalGuardrails.invalidQueryErrors)}`,
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
      filterSwitchesValue: `${toNumber(sectionData.predictionFilterTelemetry.totalSwitches)}`,
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
      sortSwitchShareText: toRateText(
        sectionData.kpis.predictionSortSwitchShare,
      ),
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
        sectionData.predictionResolutionWindowThresholds.accuracyRate
          .watchBelow,
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
    verificationSectionProps: {
      avgHoursToVerifyText: formatHoursText(
        sectionData.verificationAvgHoursToVerify,
      ),
      blockedActionCount: `${toNumber(sectionData.verificationBlockedActionCount)}`,
      blockedActionRateText: toRateText(
        sectionData.verificationBlockedActionRate,
      ),
      claimCreatedCount: `${toNumber(sectionData.verificationClaimCreatedCount)}`,
      claimFailedCount: `${toNumber(sectionData.verificationClaimFailedCount)}`,
      claimVerifiedCount: `${toNumber(sectionData.verificationClaimVerifiedCount)}`,
      failureRateText: toRateText(sectionData.verificationFailureRate),
      failureReasons: sectionData.verificationFailureReasons,
      methodRows: sectionData.verificationMethodRows,
      pendingClaimsCount: `${toNumber(sectionData.verificationPendingClaims)}`,
      revokedAgentsCount: `${toNumber(sectionData.verificationRevokedAgents)}`,
      revokedClaimsCount: `${toNumber(sectionData.verificationRevokedClaims)}`,
      totalAgentsCount: `${toNumber(sectionData.verificationTotalAgents)}`,
      totalClaimsCount: `${toNumber(sectionData.verificationTotalClaims)}`,
      unverifiedAgentsCount: `${toNumber(sectionData.verificationUnverifiedAgents)}`,
      verificationRateText: toRateText(sectionData.verificationRate),
      verificationRiskBadgeClassName: healthBadgeClass(
        sectionData.verificationRiskLevel,
      ),
      verificationRiskLabel: healthLabel(sectionData.verificationRiskLevel),
      verifiedAgentsCount: `${toNumber(sectionData.verificationVerifiedAgents)}`,
    },
  };
};
