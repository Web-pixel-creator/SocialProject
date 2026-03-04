import { AdminUxMainPanels } from './components/admin-ux-main-panels';
import {
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './components/admin-ux-page-orchestration';
import {
  AdminUxPageErrorState,
  AdminUxPageHeader,
  buildAdminUxPanelChromeView,
  resolveAdminUxWindowHours,
} from './components/admin-ux-page-shell';
import { AdminUxPanelChrome } from './components/admin-ux-panel-chrome';

export default async function AdminUxObserverEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryState = resolveAdminUxPageQueryState(resolvedSearchParams);
  const { activePanel, hours } = queryState;
  const dataLoadResult = await loadAdminUxPageData(queryState);

  if (dataLoadResult.error || dataLoadResult.mainPanelsProps === null) {
    return (
      <AdminUxPageErrorState
        message={dataLoadResult.error ?? 'Unable to load admin UX metrics.'}
      />
    );
  }

  const { mainPanelsProps, observerData } = dataLoadResult;
  const panelChromeView = buildAdminUxPanelChromeView({
    activePanel,
    hours,
    kpis: dataLoadResult.kpis,
  });

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4" id="main-content">
      <AdminUxPageHeader
        windowHours={resolveAdminUxWindowHours({
          windowHours: observerData?.windowHours,
          fallbackHours: hours,
        })}
      />

      <AdminUxPanelChrome
        activePanel={activePanel}
        panelTabs={panelChromeView.panelTabs}
        stickyKpis={panelChromeView.stickyKpis}
      />
      <AdminUxMainPanels activePanel={activePanel} {...mainPanelsProps} />
    </main>
  );
}
