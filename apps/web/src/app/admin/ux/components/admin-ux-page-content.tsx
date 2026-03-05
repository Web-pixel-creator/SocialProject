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
  const panelChromeView = buildAdminUxPanelChromeView({
    activePanel,
    allMetricsRiskFilter,
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
