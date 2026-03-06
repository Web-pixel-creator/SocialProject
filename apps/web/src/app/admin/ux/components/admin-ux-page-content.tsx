import type { BuiltMainPanelsProps } from './admin-ux-main-panel-builder-types';
import { AdminUxMainPanels } from './admin-ux-main-panels';
import {
  AdminUxPageHeader,
  AdminUxPageLayout,
} from './admin-ux-page-shell-render';
import {
  buildAdminUxPanelChromeView,
  resolveAdminUxWindowHours,
} from './admin-ux-page-shell-view-model';
import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsRiskTone,
  AdminUxAllMetricsSignalFilter,
  AdminUxAllMetricsView,
  AdminUxObservabilityScope,
  AdminUxPanel,
} from './admin-ux-page-utils';
import { AdminUxPanelChrome } from './admin-ux-panel-chrome';
import type { AdminUxSectionData } from './admin-ux-section-prep';

type MetaTone = 'critical' | 'healthy' | 'neutral' | 'watch';

const resolveMetaToneFromRiskLabel = (label: string): MetaTone => {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('critical')) {
    return 'critical';
  }
  if (normalized.includes('watch')) {
    return 'watch';
  }
  if (normalized.includes('healthy')) {
    return 'healthy';
  }
  return 'neutral';
};

const resolveMoreSevereMetaTone = (
  left: MetaTone,
  right: MetaTone,
): MetaTone => {
  const rank: Record<MetaTone, number> = {
    neutral: 0,
    healthy: 1,
    watch: 2,
    critical: 3,
  };
  return rank[left] >= rank[right] ? left : right;
};

const computeAllMetricsRiskCounts = ({
  allMetricsView,
  mainPanelsProps,
}: {
  allMetricsView: AdminUxAllMetricsView;
  mainPanelsProps: BuiltMainPanelsProps;
}): {
  all: number;
  critical: number;
  healthy: number;
  high: number;
  neutral: number;
  watch: number;
} => {
  const isSubviewVisible = (...views: AdminUxAllMetricsView[]) =>
    allMetricsView === 'overview' || views.includes(allMetricsView);
  const tones: MetaTone[] = [];
  const gatewayTone = resolveMetaToneFromRiskLabel(
    mainPanelsProps.gatewayPanelsProps.gatewayHealthLabel,
  );
  const runtimeRolesBlocked =
    mainPanelsProps.runtimePanelProps.bodyProps.aiRuntimeSummary.rolesBlocked;
  const runtimeTone: MetaTone =
    runtimeRolesBlocked > 0
      ? 'critical'
      : resolveMetaToneFromRiskLabel(
          mainPanelsProps.runtimePanelProps.runtimeHealthLabel,
        );
  const engagementSignalsCount =
    mainPanelsProps.engagementHealthProps.signals.length;
  const engagementLowSignal =
    mainPanelsProps.engagementOverviewProps.shouldCompact;
  let engagementTone: MetaTone = 'neutral';
  if (engagementLowSignal) {
    engagementTone = 'watch';
  } else if (engagementSignalsCount > 0) {
    engagementTone = 'healthy';
  }
  const feedPreferenceTone: MetaTone = mainPanelsProps.feedPreferenceKpisProps
    .shouldCompact
    ? 'watch'
    : 'healthy';
  const feedInteractionsTotal =
    mainPanelsProps.feedInteractionCountersProps.viewMode.total +
    mainPanelsProps.feedInteractionCountersProps.density.total +
    mainPanelsProps.feedInteractionCountersProps.hint.total;
  const feedInteractionsTone: MetaTone =
    feedInteractionsTotal > 0 ? 'healthy' : 'watch';
  const topSegmentsTone: MetaTone =
    mainPanelsProps.topSegmentsProps.topSegments.length > 0
      ? 'healthy'
      : 'watch';
  const verificationTone = resolveMetaToneFromRiskLabel(
    mainPanelsProps.verificationSectionProps.verificationRiskLabel,
  );
  const releaseTone = resolveMetaToneFromRiskLabel(
    mainPanelsProps.releaseHealthSectionProps.releaseRiskLabel,
  );
  const multimodalTone = resolveMetaToneFromRiskLabel(
    mainPanelsProps.multimodalTelemetrySectionProps.coverageRiskLabel,
  );
  const predictionTone = resolveMetaToneFromRiskLabel(
    mainPanelsProps.predictionMarketSectionProps.accuracyLabel,
  );
  const styleTone = resolveMoreSevereMetaTone(
    resolveMetaToneFromRiskLabel(
      mainPanelsProps.styleFusionMetricsSectionProps.fusionRiskLabel,
    ),
    resolveMetaToneFromRiskLabel(
      mainPanelsProps.styleFusionMetricsSectionProps.copyRiskLabel,
    ),
  );

  if (isSubviewVisible('operations', 'gateway')) {
    tones.push(gatewayTone);
  }
  if (isSubviewVisible('operations', 'runtime')) {
    tones.push(runtimeTone);
  }
  if (isSubviewVisible('engagement')) {
    tones.push(
      engagementTone,
      verificationTone,
      feedPreferenceTone,
      feedInteractionsTone,
      topSegmentsTone,
    );
  }
  if (isSubviewVisible('quality')) {
    tones.push(releaseTone, multimodalTone, predictionTone, styleTone);
  }
  if (isSubviewVisible('debug')) {
    tones.push('neutral');
  }

  return {
    all: tones.length,
    critical: tones.filter((tone) => tone === 'critical').length,
    healthy: tones.filter((tone) => tone === 'healthy').length,
    high: tones.filter((tone) => tone === 'critical' || tone === 'watch')
      .length,
    neutral: tones.filter((tone) => tone === 'neutral').length,
    watch: tones.filter((tone) => tone === 'watch').length,
  };
};

const computeAllMetricsSignalCounts = ({
  allMetricsView,
  mainPanelsProps,
}: {
  allMetricsView: AdminUxAllMetricsView;
  mainPanelsProps: BuiltMainPanelsProps;
}): {
  active: number;
  all: number;
} => {
  const isSubviewVisible = (...views: AdminUxAllMetricsView[]) =>
    allMetricsView === 'overview' || views.includes(allMetricsView);

  let all = 0;
  let active = 0;

  const includeGroup = (signalCount: number) => {
    all += 1;
    if (signalCount > 0) {
      active += 1;
    }
  };

  if (isSubviewVisible('operations', 'gateway')) {
    const gatewaySignalCount =
      mainPanelsProps.gatewayPanelsProps.liveBodyProps.gatewaySessions.length +
      (mainPanelsProps.gatewayPanelsProps.liveBodyProps.gatewayRecentEvents
        ?.length ?? 0);
    includeGroup(gatewaySignalCount);
  }
  if (isSubviewVisible('operations', 'runtime')) {
    const runtimeSignalCount =
      mainPanelsProps.runtimePanelProps.bodyProps.aiRuntimeSummary.roleCount +
      mainPanelsProps.runtimePanelProps.bodyProps.aiRuntimeSummary
        .providerCount;
    includeGroup(runtimeSignalCount);
  }

  if (isSubviewVisible('engagement')) {
    const engagementSignalCount = mainPanelsProps.engagementOverviewProps
      .shouldCompact
      ? 0
      : mainPanelsProps.engagementHealthProps.signals.length;
    const verificationSignalCount =
      [
        mainPanelsProps.verificationSectionProps.avgHoursToVerifyText,
        mainPanelsProps.verificationSectionProps.blockedActionCount,
        mainPanelsProps.verificationSectionProps.blockedActionRateText,
        mainPanelsProps.verificationSectionProps.claimCreatedCount,
        mainPanelsProps.verificationSectionProps.claimFailedCount,
        mainPanelsProps.verificationSectionProps.claimVerifiedCount,
        mainPanelsProps.verificationSectionProps.failureRateText,
        mainPanelsProps.verificationSectionProps.pendingClaimsCount,
        mainPanelsProps.verificationSectionProps.revokedAgentsCount,
        mainPanelsProps.verificationSectionProps.revokedClaimsCount,
        mainPanelsProps.verificationSectionProps.totalAgentsCount,
        mainPanelsProps.verificationSectionProps.totalClaimsCount,
        mainPanelsProps.verificationSectionProps.unverifiedAgentsCount,
        mainPanelsProps.verificationSectionProps.verificationRateText,
        mainPanelsProps.verificationSectionProps.verifiedAgentsCount,
      ].filter((value) => {
        const normalized = value.trim().toLowerCase();
        return normalized !== 'n/a' && normalized !== 'na';
      }).length +
      mainPanelsProps.verificationSectionProps.methodRows.length +
      mainPanelsProps.verificationSectionProps.failureReasons.length;
    const feedPreferenceSignalCount = mainPanelsProps.feedPreferenceKpisProps
      .shouldCompact
      ? 0
      : 5;
    const feedInteractionSignalCount =
      mainPanelsProps.feedInteractionCountersProps.viewMode.total +
      mainPanelsProps.feedInteractionCountersProps.density.total +
      mainPanelsProps.feedInteractionCountersProps.hint.total;
    const topSegmentsSignalCount =
      mainPanelsProps.topSegmentsProps.topSegments.length;
    includeGroup(engagementSignalCount);
    includeGroup(verificationSignalCount);
    includeGroup(feedPreferenceSignalCount);
    includeGroup(feedInteractionSignalCount);
    includeGroup(topSegmentsSignalCount);
  }

  if (isSubviewVisible('quality')) {
    const releaseSignalCount =
      [
        mainPanelsProps.releaseHealthSectionProps.releaseAlertsCount,
        mainPanelsProps.releaseHealthSectionProps.releaseFirstAppearancesCount,
        mainPanelsProps.releaseHealthSectionProps.releaseRunsCount,
        mainPanelsProps.releaseHealthSectionProps.releaseLatestRunLabel,
      ].filter((value) => {
        const normalized = value.trim().toLowerCase();
        return normalized !== 'n/a' && normalized !== 'na';
      }).length +
      mainPanelsProps.releaseHealthSectionProps.breakdownRows.length;
    const multimodalSignalCount =
      mainPanelsProps.multimodalTelemetrySectionProps.multimodalStatCards.filter(
        (card) => {
          const normalized = card.value.trim().toLowerCase();
          return normalized !== 'n/a' && normalized !== 'na';
        },
      ).length +
      [
        mainPanelsProps.multimodalTelemetrySectionProps.invalidQueryErrorsValue,
        mainPanelsProps.multimodalTelemetrySectionProps.invalidQueryShareText,
      ].filter((value) => {
        const normalized = value.trim().toLowerCase();
        return normalized !== 'n/a' && normalized !== 'na';
      }).length +
      mainPanelsProps.multimodalTelemetrySectionProps.breakdownRows.length;
    const predictionSignalCount =
      mainPanelsProps.predictionMarketSectionProps.predictionStatCards.filter(
        (card) => {
          const normalized = card.value.trim().toLowerCase();
          return normalized !== 'n/a' && normalized !== 'na';
        },
      ).length +
      [
        mainPanelsProps.predictionMarketSectionProps.filterSwitchShareText,
        mainPanelsProps.predictionMarketSectionProps.sortSwitchShareText,
        mainPanelsProps.predictionMarketSectionProps.nonDefaultSortShareText,
      ].filter((value) => {
        const normalized = value.trim().toLowerCase();
        return normalized !== 'n/a' && normalized !== 'na';
      }).length +
      mainPanelsProps.predictionMarketSectionProps.cohortsByOutcomeRows.length +
      mainPanelsProps.predictionMarketSectionProps.cohortsByStakeBandRows
        .length +
      mainPanelsProps.predictionMarketSectionProps.historyScopeRows.length +
      mainPanelsProps.predictionMarketSectionProps.scopeFilterMatrixRows
        .length +
      mainPanelsProps.predictionMarketSectionProps.scopeSortMatrixRows.length;
    const styleSignalCount =
      mainPanelsProps.styleFusionMetricsSectionProps.metrics.total +
      mainPanelsProps.styleFusionMetricsSectionProps.metrics.copy.total;
    includeGroup(releaseSignalCount);
    includeGroup(multimodalSignalCount);
    includeGroup(predictionSignalCount);
    includeGroup(styleSignalCount);
  }

  if (isSubviewVisible('debug')) {
    all += 1;
  }

  return { active, all };
};

export const AdminUxPageContent = ({
  activePanel,
  allMetricsRiskFilter,
  allMetricsSignalFilter,
  allMetricsRiskTone,
  allMetricsView,
  correlationId,
  expandAllGroups,
  executionSessionId,
  hours,
  kpis,
  mainPanelsProps,
  releaseRunId,
  routeKey,
  windowHours,
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsSignalFilter: AdminUxAllMetricsSignalFilter;
  allMetricsRiskTone: AdminUxAllMetricsRiskTone;
  allMetricsView: AdminUxAllMetricsView;
  correlationId: AdminUxObservabilityScope['correlationId'];
  expandAllGroups: boolean;
  executionSessionId: AdminUxObservabilityScope['executionSessionId'];
  hours: number;
  kpis: AdminUxSectionData['kpis'] | null | undefined;
  mainPanelsProps: BuiltMainPanelsProps;
  releaseRunId: AdminUxObservabilityScope['releaseRunId'];
  routeKey: AdminUxObservabilityScope['routeKey'];
  windowHours: unknown;
}) => {
  const allMetricsRiskCounts =
    activePanel === 'all'
      ? computeAllMetricsRiskCounts({
          allMetricsView,
          mainPanelsProps,
        })
      : undefined;
  const allMetricsSignalCounts =
    activePanel === 'all'
      ? computeAllMetricsSignalCounts({
          allMetricsView,
          mainPanelsProps,
        })
      : undefined;
  const panelChromeView = buildAdminUxPanelChromeView({
    activePanel,
    allMetricsRiskFilter,
    allMetricsSignalFilter,
    allMetricsRiskTone,
    allMetricsRiskCounts,
    allMetricsSignalCounts,
    allMetricsView,
    correlationId,
    expandAllGroups,
    executionSessionId,
    hours,
    kpis,
    releaseRunId,
    routeKey,
  });

  return (
    <AdminUxPageLayout>
      <AdminUxPageHeader
        windowHours={resolveAdminUxWindowHours({
          windowHours,
          fallbackHours: hours,
        })}
      />

      <AdminUxPanelChrome
        activePanel={activePanel}
        allMetricsControls={panelChromeView.allMetricsControls}
        allMetricsRiskFilterTabs={panelChromeView.allMetricsRiskFilterTabs}
        allMetricsRiskSnapshot={panelChromeView.allMetricsRiskSnapshot}
        allMetricsSignalFilterTabs={panelChromeView.allMetricsSignalFilterTabs}
        allMetricsViewTabs={panelChromeView.allMetricsViewTabs}
        panelTabs={panelChromeView.panelTabs}
        stickyKpis={panelChromeView.stickyKpis}
      />
      <AdminUxMainPanels
        activePanel={activePanel}
        allMetricsRiskFilter={allMetricsRiskFilter}
        allMetricsRiskTone={allMetricsRiskTone}
        allMetricsSignalFilter={allMetricsSignalFilter}
        allMetricsView={allMetricsView}
        expandAllGroups={expandAllGroups}
        {...mainPanelsProps}
      />
    </AdminUxPageLayout>
  );
};
