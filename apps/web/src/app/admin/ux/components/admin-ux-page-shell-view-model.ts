import {
  healthBadgeClass,
  healthLabel,
  resolveHealthLevel,
  toNumber,
  toRateText,
} from './admin-ux-mappers';
import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsRiskTone,
  AdminUxAllMetricsSignalFilter,
  AdminUxAllMetricsView,
  AdminUxObservabilityScope,
  AdminUxPanel,
} from './admin-ux-page-utils';
import type { AdminUxSectionData } from './admin-ux-section-prep';
import {
  buildPanelTabsView,
  buildStickyKpisView,
} from './admin-ux-view-models';

export const ADMIN_UX_PANEL_TABS: ReadonlyArray<{
  id: AdminUxPanel;
  label: string;
}> = [
  { id: 'gateway', label: 'Gateway' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'prediction', label: 'Prediction' },
  { id: 'release', label: 'Release' },
  { id: 'style', label: 'Style' },
  { id: 'debug', label: 'Debug' },
  { id: 'all', label: 'All metrics' },
] as const;

interface AllMetricsRiskCounts {
  all: number;
  critical: number;
  healthy: number;
  high: number;
  neutral: number;
  watch: number;
}

interface AllMetricsSignalCounts {
  active: number;
  all: number;
}

const ALL_METRICS_RISK_SNAPSHOT_TONES: ReadonlyArray<{
  id: AdminUxAllMetricsRiskTone;
  label: string;
}> = [
  { id: 'critical', label: 'critical' },
  { id: 'watch', label: 'watch' },
  { id: 'healthy', label: 'healthy' },
  { id: 'neutral', label: 'info' },
] as const;

type AdminUxAllMetricsViewTabId = Exclude<AdminUxAllMetricsView, 'operations'>;

const ADMIN_UX_ALL_METRICS_VIEW_TABS: ReadonlyArray<{
  id: AdminUxAllMetricsViewTabId;
  label: string;
}> = [
  { id: 'overview', label: 'All' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'quality', label: 'Quality' },
  { id: 'debug', label: 'Debug' },
] as const;

const resolveAllMetricsViewTabId = (
  view: AdminUxAllMetricsView,
): AdminUxAllMetricsViewTabId => {
  if (view === 'operations') {
    return 'overview';
  }
  return view;
};

const ADMIN_UX_ALL_METRICS_RISK_FILTER_TABS: ReadonlyArray<{
  id: AdminUxAllMetricsRiskFilter;
  label: string;
}> = [
  { id: 'all', label: 'All severities' },
  { id: 'high', label: 'Risk only' },
] as const;

const ADMIN_UX_ALL_METRICS_SIGNAL_FILTER_TABS: ReadonlyArray<{
  id: AdminUxAllMetricsSignalFilter;
  label: string;
}> = [
  { id: 'all', label: 'All sections' },
  { id: 'active', label: 'Signal only' },
] as const;

export const buildAdminUxPanelHref = (
  hours: number,
  panel: AdminUxPanel,
  {
    allMetricsRiskFilter = 'all',
    allMetricsSignalFilter = 'all',
    allMetricsRiskTone = 'all',
    allMetricsView = 'overview',
    correlationId = null,
    expandAllGroups = false,
    executionSessionId = null,
    releaseRunId = null,
    routeKey = null,
  }: {
    allMetricsRiskFilter?: AdminUxAllMetricsRiskFilter;
    allMetricsSignalFilter?: AdminUxAllMetricsSignalFilter;
    allMetricsRiskTone?: AdminUxAllMetricsRiskTone;
    allMetricsView?: AdminUxAllMetricsView;
    correlationId?: AdminUxObservabilityScope['correlationId'];
    expandAllGroups?: boolean;
    executionSessionId?: AdminUxObservabilityScope['executionSessionId'];
    releaseRunId?: AdminUxObservabilityScope['releaseRunId'];
    routeKey?: AdminUxObservabilityScope['routeKey'];
  } = {},
): string => {
  const queryParams = new URLSearchParams({
    hours: `${hours}`,
    panel,
  });
  if (panel === 'all' && allMetricsView !== 'overview') {
    queryParams.set('allView', allMetricsView);
  }
  if (panel === 'all' && allMetricsRiskFilter !== 'all') {
    queryParams.set('risk', allMetricsRiskFilter);
  }
  if (panel === 'all' && allMetricsSignalFilter !== 'all') {
    queryParams.set('signal', allMetricsSignalFilter);
  }
  if (panel === 'all' && allMetricsRiskTone !== 'all') {
    queryParams.set('riskTone', allMetricsRiskTone);
  }
  if (panel === 'all' && expandAllGroups) {
    queryParams.set('expand', 'all');
  }
  if (correlationId) {
    queryParams.set('correlationId', correlationId);
  }
  if (executionSessionId) {
    queryParams.set('executionSessionId', executionSessionId);
  }
  if (releaseRunId) {
    queryParams.set('releaseRunId', releaseRunId);
  }
  if (routeKey) {
    queryParams.set('routeKey', routeKey);
  }
  return `/admin/ux?${queryParams.toString()}`;
};

export const buildAdminUxPanelChromeView = ({
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
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsSignalFilter: AdminUxAllMetricsSignalFilter;
  allMetricsRiskTone: AdminUxAllMetricsRiskTone;
  allMetricsRiskCounts?: AllMetricsRiskCounts;
  allMetricsSignalCounts?: AllMetricsSignalCounts;
  allMetricsView: AdminUxAllMetricsView;
  correlationId: AdminUxObservabilityScope['correlationId'];
  expandAllGroups: boolean;
  executionSessionId: AdminUxObservabilityScope['executionSessionId'];
  hours: number;
  kpis: AdminUxSectionData['kpis'] | null | undefined;
  releaseRunId: AdminUxObservabilityScope['releaseRunId'];
  routeKey: AdminUxObservabilityScope['routeKey'];
}) => ({
  allMetricsRiskFilterTabs:
    activePanel === 'all'
      ? buildPanelTabsView({
          activePanel: allMetricsRiskFilter,
          buildPanelHref: (riskFilter) =>
            buildAdminUxPanelHref(hours, 'all', {
              allMetricsRiskFilter: riskFilter,
              allMetricsSignalFilter,
              allMetricsRiskTone,
              allMetricsView,
              correlationId,
              expandAllGroups,
              executionSessionId,
              releaseRunId,
              routeKey,
            }),
          panelTabs: ADMIN_UX_ALL_METRICS_RISK_FILTER_TABS.map((tab) => ({
            ...tab,
            label:
              tab.id === 'high'
                ? `${tab.label} (${allMetricsRiskCounts?.high ?? 0})`
                : `${tab.label} (${allMetricsRiskCounts?.all ?? 0})`,
          })),
        })
      : null,
  allMetricsSignalFilterTabs:
    activePanel === 'all'
      ? buildPanelTabsView({
          activePanel: allMetricsSignalFilter,
          buildPanelHref: (signalFilter) =>
            buildAdminUxPanelHref(hours, 'all', {
              allMetricsRiskFilter,
              allMetricsSignalFilter: signalFilter,
              allMetricsRiskTone,
              allMetricsView,
              correlationId,
              expandAllGroups,
              executionSessionId,
              releaseRunId,
              routeKey,
            }),
          panelTabs: ADMIN_UX_ALL_METRICS_SIGNAL_FILTER_TABS.map((tab) => ({
            ...tab,
            label:
              tab.id === 'active'
                ? `${tab.label} (${allMetricsSignalCounts?.active ?? 0})`
                : `${tab.label} (${allMetricsSignalCounts?.all ?? 0})`,
          })),
        })
      : null,
  allMetricsRiskSnapshot:
    activePanel === 'all' && allMetricsRiskCounts
      ? {
          activeTone: allMetricsRiskTone,
          critical: allMetricsRiskCounts.critical,
          healthy: allMetricsRiskCounts.healthy,
          neutral: allMetricsRiskCounts.neutral,
          toneHrefs: ALL_METRICS_RISK_SNAPSHOT_TONES.map((tone) => ({
            id: tone.id,
            href: buildAdminUxPanelHref(hours, 'all', {
              allMetricsRiskFilter: 'all',
              allMetricsSignalFilter,
              allMetricsRiskTone:
                allMetricsRiskTone === tone.id ? 'all' : tone.id,
              allMetricsView,
              correlationId,
              expandAllGroups,
              executionSessionId,
              releaseRunId,
              routeKey,
            }),
            label: tone.label,
          })),
          watch: allMetricsRiskCounts.watch,
        }
      : null,
  allMetricsViewTabs:
    activePanel === 'all'
      ? buildPanelTabsView({
          activePanel: resolveAllMetricsViewTabId(allMetricsView),
          buildPanelHref: (view) =>
            buildAdminUxPanelHref(hours, 'all', {
              allMetricsRiskFilter,
              allMetricsSignalFilter,
              allMetricsRiskTone,
              allMetricsView: view,
              correlationId,
              expandAllGroups,
              executionSessionId,
              releaseRunId,
              routeKey,
            }),
          panelTabs: [...ADMIN_UX_ALL_METRICS_VIEW_TABS],
        })
      : null,
  allMetricsControls:
    activePanel === 'all'
      ? {
          collapseHref: buildAdminUxPanelHref(hours, 'all', {
            allMetricsRiskFilter,
            allMetricsSignalFilter,
            allMetricsRiskTone,
            allMetricsView,
            correlationId,
            executionSessionId,
            releaseRunId,
            routeKey,
          }),
          expandHref: buildAdminUxPanelHref(hours, 'all', {
            allMetricsRiskFilter,
            allMetricsSignalFilter,
            allMetricsRiskTone,
            allMetricsView,
            correlationId,
            expandAllGroups: true,
            executionSessionId,
            releaseRunId,
            routeKey,
          }),
          expanded: expandAllGroups,
        }
      : null,
  panelTabs: buildPanelTabsView({
    activePanel,
    buildPanelHref: (panel) =>
      buildAdminUxPanelHref(hours, panel, {
        allMetricsRiskFilter,
        allMetricsSignalFilter,
        allMetricsRiskTone,
        allMetricsView,
        correlationId,
        expandAllGroups,
        executionSessionId,
        releaseRunId,
        routeKey,
      }),
    panelTabs: [...ADMIN_UX_PANEL_TABS],
  }),
  stickyKpis: buildStickyKpisView({
    healthBadgeClass,
    healthLabel,
    kpis: kpis ?? {},
    resolveHealthLevel,
    toRateText,
  }),
});

export const resolveAdminUxWindowHours = ({
  fallbackHours,
  windowHours,
}: {
  fallbackHours: number;
  windowHours: unknown;
}): number => toNumber(windowHours, fallbackHours);
