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
  AdminUxAllMetricsView,
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

const ALL_METRICS_RISK_SNAPSHOT_TONES: ReadonlyArray<{
  id: AdminUxAllMetricsRiskTone;
  label: string;
}> = [
  { id: 'critical', label: 'critical' },
  { id: 'watch', label: 'watch' },
  { id: 'healthy', label: 'healthy' },
  { id: 'neutral', label: 'info' },
] as const;

const ADMIN_UX_ALL_METRICS_VIEW_TABS: ReadonlyArray<{
  id: AdminUxAllMetricsView;
  label: string;
}> = [
  { id: 'overview', label: 'Overview' },
  { id: 'operations', label: 'Operations' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'quality', label: 'Quality' },
  { id: 'debug', label: 'Debug' },
] as const;

const ADMIN_UX_ALL_METRICS_RISK_FILTER_TABS: ReadonlyArray<{
  id: AdminUxAllMetricsRiskFilter;
  label: string;
}> = [
  { id: 'all', label: 'All severities' },
  { id: 'high', label: 'Risk only' },
] as const;

export const buildAdminUxPanelHref = (
  hours: number,
  panel: AdminUxPanel,
  {
    allMetricsRiskFilter = 'all',
    allMetricsRiskTone = 'all',
    allMetricsView = 'overview',
    expandAllGroups = false,
  }: {
    allMetricsRiskFilter?: AdminUxAllMetricsRiskFilter;
    allMetricsRiskTone?: AdminUxAllMetricsRiskTone;
    allMetricsView?: AdminUxAllMetricsView;
    expandAllGroups?: boolean;
  } = {},
): string => {
  let href = `/admin/ux?hours=${hours}&panel=${panel}`;
  if (panel === 'all' && allMetricsView !== 'overview') {
    href += `&allView=${allMetricsView}`;
  }
  if (panel === 'all' && allMetricsRiskFilter !== 'all') {
    href += `&risk=${allMetricsRiskFilter}`;
  }
  if (panel === 'all' && allMetricsRiskTone !== 'all') {
    href += `&riskTone=${allMetricsRiskTone}`;
  }
  if (panel === 'all' && expandAllGroups) {
    href += '&expand=all';
  }
  return href;
};

export const buildAdminUxPanelChromeView = ({
  activePanel,
  allMetricsRiskFilter,
  allMetricsRiskTone,
  allMetricsRiskCounts,
  allMetricsView,
  expandAllGroups,
  hours,
  kpis,
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsRiskTone: AdminUxAllMetricsRiskTone;
  allMetricsRiskCounts?: AllMetricsRiskCounts;
  allMetricsView: AdminUxAllMetricsView;
  expandAllGroups: boolean;
  hours: number;
  kpis: AdminUxSectionData['kpis'] | null | undefined;
}) => ({
  allMetricsRiskFilterTabs:
    activePanel === 'all'
      ? buildPanelTabsView({
          activePanel: allMetricsRiskFilter,
          buildPanelHref: (riskFilter) =>
            buildAdminUxPanelHref(hours, 'all', {
              allMetricsRiskFilter: riskFilter,
              allMetricsRiskTone,
              allMetricsView,
              expandAllGroups,
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
              allMetricsRiskTone:
                allMetricsRiskTone === tone.id ? 'all' : tone.id,
              allMetricsView,
              expandAllGroups,
            }),
            label: tone.label,
          })),
          watch: allMetricsRiskCounts.watch,
        }
      : null,
  allMetricsViewTabs:
    activePanel === 'all'
      ? buildPanelTabsView({
          activePanel: allMetricsView,
          buildPanelHref: (view) =>
            buildAdminUxPanelHref(hours, 'all', {
              allMetricsRiskFilter,
              allMetricsRiskTone,
              allMetricsView: view,
              expandAllGroups,
            }),
          panelTabs: [...ADMIN_UX_ALL_METRICS_VIEW_TABS],
        })
      : null,
  allMetricsControls:
    activePanel === 'all'
      ? {
          collapseHref: buildAdminUxPanelHref(hours, 'all', {
            allMetricsRiskFilter,
            allMetricsRiskTone,
            allMetricsView,
          }),
          expandHref: buildAdminUxPanelHref(hours, 'all', {
            allMetricsRiskFilter,
            allMetricsRiskTone,
            allMetricsView,
            expandAllGroups: true,
          }),
          expanded: expandAllGroups,
        }
      : null,
  panelTabs: buildPanelTabsView({
    activePanel,
    buildPanelHref: (panel) =>
      buildAdminUxPanelHref(hours, panel, {
        allMetricsRiskFilter,
        allMetricsRiskTone,
        allMetricsView,
        expandAllGroups,
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
