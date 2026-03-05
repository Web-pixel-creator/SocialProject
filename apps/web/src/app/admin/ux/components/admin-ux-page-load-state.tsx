import { AdminUxPageContent } from './admin-ux-page-content';
import type { AdminUxPageDataLoadResult } from './admin-ux-page-orchestration';
import { AdminUxPageErrorState } from './admin-ux-page-shell-render';
import type { AdminUxPanel } from './admin-ux-page-utils';

export const AdminUxPageLoadState = ({
  activePanel,
  dataLoadResult,
  expandAllGroups,
  hours,
}: {
  activePanel: AdminUxPanel;
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
      expandAllGroups={expandAllGroups}
      hours={hours}
      kpis={dataLoadResult.kpis}
      mainPanelsProps={dataLoadResult.mainPanelsProps}
      windowHours={dataLoadResult.observerData?.windowHours}
    />
  );
};
