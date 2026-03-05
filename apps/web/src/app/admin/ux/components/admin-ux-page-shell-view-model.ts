import {
  healthBadgeClass,
  healthLabel,
  resolveHealthLevel,
  toNumber,
  toRateText,
} from './admin-ux-mappers';
import type {
  AdminUxAllMetricsRiskFilter,
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
    allMetricsView = 'overview',
    expandAllGroups = false,
  }: {
    allMetricsRiskFilter?: AdminUxAllMetricsRiskFilter;
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
  if (panel === 'all' && expandAllGroups) {
    href += '&expand=all';
  }
  return href;
};

export const buildAdminUxPanelChromeView = ({
  activePanel,
  allMetricsRiskFilter,
  allMetricsView,
  expandAllGroups,
  hours,
  kpis,
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
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
              allMetricsView,
              expandAllGroups,
            }),
          panelTabs: [...ADMIN_UX_ALL_METRICS_RISK_FILTER_TABS],
        })
      : null,
  allMetricsViewTabs:
    activePanel === 'all'
      ? buildPanelTabsView({
          activePanel: allMetricsView,
          buildPanelHref: (view) =>
            buildAdminUxPanelHref(hours, 'all', {
              allMetricsRiskFilter,
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
            allMetricsView,
          }),
          expandHref: buildAdminUxPanelHref(hours, 'all', {
            allMetricsRiskFilter,
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
