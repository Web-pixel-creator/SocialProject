import { AdminUxPageContent } from './admin-ux-page-content';
import type { AdminUxPageDataLoadResult } from './admin-ux-page-orchestration';
import { AdminUxPageErrorState } from './admin-ux-page-shell-render';
import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsRiskTone,
  AdminUxAllMetricsSignalFilter,
  AdminUxAllMetricsView,
  AdminUxPanel,
} from './admin-ux-page-utils';

export const AdminUxPageLoadState = ({
  activePanel,
  allMetricsRiskFilter,
  allMetricsSignalFilter,
  allMetricsRiskTone,
  allMetricsView,
  dataLoadResult,
  expandAllGroups,
  hours,
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsSignalFilter: AdminUxAllMetricsSignalFilter;
  allMetricsRiskTone: AdminUxAllMetricsRiskTone;
  allMetricsView: AdminUxAllMetricsView;
  dataLoadResult: AdminUxPageDataLoadResult;
  expandAllGroups: boolean;
  hours: number;
}) => {
  if (dataLoadResult.error || dataLoadResult.mainPanelsProps === null) {
    return (
      <AdminUxPageErrorState
        message={dataLoadResult.error ?? 'Unable to load admin UX metrics.'}
      />
    );
  }

  return (
    <AdminUxPageContent
      activePanel={activePanel}
      allMetricsRiskFilter={allMetricsRiskFilter}
      allMetricsRiskTone={allMetricsRiskTone}
      allMetricsSignalFilter={allMetricsSignalFilter}
      allMetricsView={allMetricsView}
      expandAllGroups={expandAllGroups}
      hours={hours}
      kpis={dataLoadResult.kpis}
      mainPanelsProps={dataLoadResult.mainPanelsProps}
      windowHours={dataLoadResult.observerData?.windowHours}
    />
  );
};
