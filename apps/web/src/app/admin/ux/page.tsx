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
import type { AdminUxPanel } from './components/admin-ux-page-utils';
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
      <main className="grid gap-4" id="main-content">
        <header className="card p-4 sm:p-5">
          <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
            Admin UX Metrics
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {dataLoadResult.error ?? 'Unable to load admin UX metrics.'}
          </p>
        </header>
      </main>
    );
  }

  const { mainPanelsProps, observerData } = dataLoadResult;
  const kpis = dataLoadResult.kpis ?? {};
  const panelTabs: Array<{
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
  ];
  const buildPanelHref = (panel: AdminUxPanel) =>
    `/admin/ux?hours=${hours}&panel=${panel}`;
  const panelTabsView = buildPanelTabsView({
    activePanel,
    buildPanelHref,
    panelTabs,
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
      <header className="card p-4 sm:p-5">
        <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
          Admin UX Metrics
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Observer engagement and feed preference telemetry. Window:{' '}
          {toNumber(observerData?.windowHours, hours)}h
        </p>
      </header>

      <AdminUxPanelChrome
        activePanel={activePanel}
        panelTabs={panelTabsView}
        stickyKpis={stickyKpisView}
      />
      <AdminUxMainPanels activePanel={activePanel} {...mainPanelsProps} />
    </main>
  );
}
