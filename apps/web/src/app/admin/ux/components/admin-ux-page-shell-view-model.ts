import {
  healthBadgeClass,
  healthLabel,
  resolveHealthLevel,
  toNumber,
  toRateText,
} from './admin-ux-mappers';
import type { AdminUxPanel } from './admin-ux-page-utils';
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

export const buildAdminUxPanelHref = (
  hours: number,
  panel: AdminUxPanel,
  expandAllGroups = false,
): string => {
  const href = `/admin/ux?hours=${hours}&panel=${panel}`;
  if (panel === 'all' && expandAllGroups) {
    return `${href}&expand=all`;
  }
  return href;
};

export const buildAdminUxPanelChromeView = ({
  activePanel,
  expandAllGroups,
  hours,
  kpis,
}: {
  activePanel: AdminUxPanel;
  expandAllGroups: boolean;
  hours: number;
  kpis: AdminUxSectionData['kpis'] | null | undefined;
}) => ({
  allMetricsControls:
    activePanel === 'all'
      ? {
          collapseHref: buildAdminUxPanelHref(hours, 'all'),
          expandHref: buildAdminUxPanelHref(hours, 'all', true),
          expanded: expandAllGroups,
        }
      : null,
  panelTabs: buildPanelTabsView({
    activePanel,
    buildPanelHref: (panel) =>
      buildAdminUxPanelHref(hours, panel, expandAllGroups),
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
