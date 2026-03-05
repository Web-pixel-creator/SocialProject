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
  AdminUxAllMetricsView,
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
}): { all: number; high: number } => {
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

  if (isSubviewVisible('operations')) {
    tones.push(gatewayTone, runtimeTone);
  }
  if (isSubviewVisible('engagement')) {
    tones.push(
      engagementTone,
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
    high: tones.filter((tone) => tone === 'critical' || tone === 'watch')
      .length,
  };
};

export const AdminUxPageContent = ({
  activePanel,
  allMetricsRiskFilter,
  allMetricsView,
  expandAllGroups,
  hours,
  kpis,
  mainPanelsProps,
  windowHours,
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsView: AdminUxAllMetricsView;
  expandAllGroups: boolean;
  hours: number;
  kpis: AdminUxSectionData['kpis'] | null | undefined;
  mainPanelsProps: BuiltMainPanelsProps;
  windowHours: unknown;
}) => {
  const allMetricsRiskCounts =
    activePanel === 'all'
      ? computeAllMetricsRiskCounts({
          allMetricsView,
          mainPanelsProps,
        })
      : undefined;
  const panelChromeView = buildAdminUxPanelChromeView({
    activePanel,
    allMetricsRiskFilter,
    allMetricsRiskCounts,
    allMetricsView,
    expandAllGroups,
    hours,
    kpis,
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
        allMetricsViewTabs={panelChromeView.allMetricsViewTabs}
        panelTabs={panelChromeView.panelTabs}
        stickyKpis={panelChromeView.stickyKpis}
      />
      <AdminUxMainPanels
        activePanel={activePanel}
        allMetricsRiskFilter={allMetricsRiskFilter}
        allMetricsView={allMetricsView}
        expandAllGroups={expandAllGroups}
        {...mainPanelsProps}
      />
    </AdminUxPageLayout>
  );
};
