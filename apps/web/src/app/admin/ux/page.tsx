import { AdminUxMainPanels } from './components/admin-ux-main-panels';
import {
  healthBadgeClass,
  healthLabel,
  resolveHealthLevel,
  toNumber,
  toRateText,
} from './components/admin-ux-mappers';
import {
  loadAdminUxPageData,
  resolveAdminUxPageQueryState,
} from './components/admin-ux-page-orchestration';
import {
  ADMIN_UX_PANEL_TABS,
  AdminUxPageErrorState,
  AdminUxPageHeader,
  buildAdminUxPanelHref,
} from './components/admin-ux-page-shell';
import { AdminUxPanelChrome } from './components/admin-ux-panel-chrome';
import {
  buildPanelTabsView,
  buildStickyKpisView,
} from './components/admin-ux-view-models';

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
  const kpis = dataLoadResult.kpis ?? {};
  const panelTabsView = buildPanelTabsView({
    activePanel,
    buildPanelHref: (panel) => buildAdminUxPanelHref(hours, panel),
    panelTabs: [...ADMIN_UX_PANEL_TABS],
  });
  const stickyKpisView = buildStickyKpisView({
    healthBadgeClass,
    healthLabel,
    kpis,
    resolveHealthLevel,
    toRateText,
  });

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4" id="main-content">
      <AdminUxPageHeader
        windowHours={toNumber(observerData?.windowHours, hours)}
      />

      <AdminUxPanelChrome
        activePanel={activePanel}
        panelTabs={panelTabsView}
        stickyKpis={stickyKpisView}
      />
      <AdminUxMainPanels activePanel={activePanel} {...mainPanelsProps} />
    </main>
  );
}
