import {
  closeAgentGatewaySession,
  compactAgentGatewaySession,
  fetchAgentGatewayOverview,
  fetchAgentGatewayRecentEvents,
  fetchAgentGatewaySessions,
  fetchAgentGatewayTelemetry,
  fetchObserverEngagement,
  fetchSimilarSearchMetrics,
  resolveAdminApiBaseUrl,
  resolveAdminToken,
} from './components/admin-ux-data-client';
import { AdminUxMainPanels } from './components/admin-ux-main-panels';
import {
  deriveAiRuntimeHealthLevel,
  deriveGatewayHealthLevel,
  healthBadgeClass,
  healthLabel,
  resolveHealthLevel,
  toDurationText,
  toFixedText,
  toNumber,
  toRateText,
  toStringValue,
} from './components/admin-ux-mappers';
import {
  type AdminUxPanel,
  buildEventsCsv,
  resolveAdminUxPanel,
} from './components/admin-ux-page-utils';
import { AdminUxPanelChrome } from './components/admin-ux-panel-chrome';
import { prepareAdminUxSectionData } from './components/admin-ux-section-prep';
import {
  buildDebugContextRows,
  buildDebugPayloadText,
  buildPanelTabsView,
  buildStickyKpisView,
} from './components/admin-ux-view-models';
import {
  AI_RUNTIME_ROLES,
  fetchAiRuntimeHealth,
  recomputeAiRuntimeSummary,
  resolveAiRuntimeDryRunState,
  resolveAiRuntimeQueryState,
} from './components/ai-runtime-orchestration';
import {
  resolveGatewayEventsRequestFilters,
  resolveGatewayQueryState,
  resolveGatewaySessionMutations,
} from './components/gateway-query-state';
import { resolveGatewaySessionOrchestrationState } from './components/gateway-session-orchestration';
import {
  BreakdownListCard,
  GatewayCompactionHourlyTrendCard,
  GatewayTelemetryThresholdsCard,
  HourlyTrendCard,
  PredictionHourlyTrendCard,
  ReleaseHealthAlertHourlyTrendCard,
} from './components/telemetry-shared-cards';

export default async function AdminUxObserverEngagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawHours = resolvedSearchParams?.hours;
  const parsedHours =
    typeof rawHours === 'string' ? Number.parseInt(rawHours, 10) : 24;
  const hours = Number.isFinite(parsedHours)
    ? Math.min(Math.max(parsedHours, 1), 720)
    : 24;
  const activePanel = resolveAdminUxPanel(resolvedSearchParams?.panel);
  const {
    gatewayChannelFilter,
    gatewayProviderFilter,
    gatewaySourceFilter,
    gatewayStatusFilter,
    sessionIdFromQuery,
    compactRequested,
    closeRequested,
    keepRecent,
    eventsLimit,
    eventTypeFilter,
    eventQuery,
  } = resolveGatewayQueryState(resolvedSearchParams);
  const {
    aiRole,
    aiPrompt,
    aiProvidersCsv,
    aiProvidersOverride,
    aiFailuresCsv,
    aiSimulateFailures,
    aiTimeoutMs,
    aiDryRunRequested,
  } = resolveAiRuntimeQueryState(resolvedSearchParams);

  const { data, error } = await fetchObserverEngagement(hours);
  const { data: similarSearchMetrics } = await fetchSimilarSearchMetrics(hours);

  if (error) {
    return (
      <main className="grid gap-4" id="main-content">
        <header className="card p-4 sm:p-5">
          <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
            Admin UX Metrics
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">{error}</p>
        </header>
      </main>
    );
  }

  const {
    data: gatewaySessions,
    error: gatewaySessionsError,
    filters: gatewaySessionFilters,
    source: gatewaySessionsSource,
  } = await fetchAgentGatewaySessions(25, {
    source: gatewaySourceFilter,
    channel: gatewayChannelFilter,
    provider: gatewayProviderFilter,
    status: gatewayStatusFilter,
  });
  const { data: gatewayTelemetry, error: gatewayTelemetryError } =
    await fetchAgentGatewayTelemetry(hours, {
      channel: gatewayChannelFilter,
      provider: gatewayProviderFilter,
    });
  const {
    generatedAt: aiRuntimeHealthGeneratedAt,
    roleStates: aiRuntimeRoleStatesBase,
    providers: aiRuntimeProvidersBase,
    error: aiRuntimeHealthError,
  } = await fetchAiRuntimeHealth({
    adminToken: resolveAdminToken,
    apiBaseUrl: resolveAdminApiBaseUrl,
    toNumber,
    toStringValue,
  });
  const {
    closeInfoMessage,
    compactInfoMessage,
    gatewayError,
    gatewayOverview,
    gatewayRecentEvents,
    keepRecentValue,
    selectedSession,
    selectedSessionClosed,
    selectedSessionId,
  } = await resolveGatewaySessionOrchestrationState({
    closeRequested,
    compactRequested,
    eventQuery,
    eventTypeFilter,
    eventsLimit,
    fetchAgentGatewayOverview,
    fetchAgentGatewayRecentEvents,
    gatewayProviderFilter,
    gatewaySessionFilters,
    gatewaySessions,
    gatewaySessionsError,
    gatewaySessionsSource,
    keepRecent,
    resolveGatewayEventsRequestFilters,
    resolveGatewaySessionMutations: (args) =>
      resolveGatewaySessionMutations({
        ...args,
        closeAgentGatewaySession,
        compactAgentGatewaySession,
      }),
    sessionIdFromQuery,
    toStringValue,
  });

  const {
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionChannelFilter,
    appliedGatewaySessionProviderFilter,
    appliedGatewaySessionStatusInputValue,
    appliedGatewaySessionStatusLabel,
    density,
    densityTotal,
    engagementAvgSessionSeconds,
    engagementHealthSignals,
    engagementSessionCount,
    gatewayCompactionHourlyTrend,
    gatewayEventCounters,
    gatewayRiskSignalsView,
    gatewayScopeOverridesApplied,
    gatewayScopeRows,
    gatewaySessionScopeLabel,
    gatewayTelemetryChannelUsage,
    gatewayTelemetryProviderUsage,
    gatewayTelemetrySessions,
    gatewayTelemetryStatCards,
    gatewayTelemetryThresholds,
    hint,
    hintInteractionTotal,
    kpis,
    multimodalBreakdownRows,
    multimodalGuardrails,
    multimodalHourlyTrend,
    multimodalOverallLevel,
    multimodalStatCards,
    predictionAccuracyLevel,
    predictionCohortThresholdSummary,
    predictionCohortsByOutcomeView,
    predictionCohortsByStakeBandView,
    predictionFilterByFilterBreakdown,
    predictionFilterByScopeAndFilter,
    predictionFilterByScopeBreakdown,
    predictionFilterTelemetry,
    predictionHistoryScopeStates,
    predictionHourlyTrend,
    predictionOutcomesBreakdown,
    predictionResolutionWindowThresholds,
    predictionSortByScopeAndSort,
    predictionSortByScopeBreakdown,
    predictionSortBySortBreakdown,
    predictionSortTelemetry,
    predictionStatCards,
    predictionTotals,
    predictionWindow30dView,
    predictionWindow7dView,
    releaseBreakdownRows,
    releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertHourlyTrend,
    releaseHealthAlertLatest,
    releaseHealthAlertLatestReceivedAt,
    releaseHealthAlertLatestRunLabel,
    releaseHealthAlertRiskLevel,
    releaseHealthAlertedRunCount,
    resolvedGatewayTelemetryHealthLevel,
    shouldCompactEngagementOverview,
    shouldCompactFeedPreferenceEvents,
    shouldCompactFeedPreferenceKpis,
    styleFusionCopyRiskLevel,
    styleFusionMetrics,
    styleFusionRiskLevel,
    topGatewayProvider,
    topSegmentsView,
    viewMode,
    viewModeTotal,
  } = prepareAdminUxSectionData({
    data,
    gatewayChannelFilter,
    gatewayOverview,
    gatewayProviderFilter,
    gatewaySessionFilters,
    gatewaySourceFilter,
    gatewayStatusFilter,
    gatewayTelemetry,
    similarSearchMetrics,
  });
  const aiRuntimeDryRunState = await resolveAiRuntimeDryRunState({
    adminToken: resolveAdminToken,
    apiBaseUrl: resolveAdminApiBaseUrl,
    toStringValue,
    requested: aiDryRunRequested,
    role: aiRole,
    prompt: aiPrompt,
    providersOverride: aiProvidersOverride,
    simulateFailures: aiSimulateFailures,
    timeoutMs: aiTimeoutMs,
    providersBase: aiRuntimeProvidersBase,
  });
  const aiRuntimeProviders = aiRuntimeDryRunState.providers;
  const aiRuntimeDryRunInfoMessage = aiRuntimeDryRunState.infoMessage;
  const aiRuntimeDryRunErrorMessage = aiRuntimeDryRunState.errorMessage;
  const aiRuntimeDryRunResult = aiRuntimeDryRunState.result;
  const aiRuntimeSummary = recomputeAiRuntimeSummary({
    roleStates: aiRuntimeRoleStatesBase,
    providers: aiRuntimeProviders,
  });
  const aiRuntimeHealthLevel = deriveAiRuntimeHealthLevel(aiRuntimeSummary);
  const gatewayHealthLevel = deriveGatewayHealthLevel(gatewayOverview);
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
  const gatewayDebugStatusLabel = toStringValue(
    gatewayOverview?.session.status ?? selectedSession?.status,
    appliedGatewaySessionStatusLabel,
  );
  const debugPayloadText = buildDebugPayloadText({
    activePanel,
    aiRuntimeDryRunResult,
    aiRuntimeProviders,
    aiRuntimeSummary,
    gatewayChannelFilter,
    gatewayOverview,
    gatewayProviderFilter,
    gatewayRecentEvents,
    gatewaySourceFilter,
    gatewayStatusFilter,
    gatewayTelemetry,
    releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertLatest,
    releaseHealthAlertedRunCount,
  });
  const debugContextRows = buildDebugContextRows({
    activePanel,
    gatewaySessionScopeLabel,
    gatewaySessionsSource: toStringValue(gatewaySessionsSource, 'n/a'),
    gatewayStatusLabel: gatewayDebugStatusLabel,
    hours,
    releaseRiskLabel: healthLabel(releaseHealthAlertRiskLevel),
    runtimeHealthLabel: toStringValue(aiRuntimeSummary.health, 'n/a'),
    selectedSessionId,
  });
  const debugEventsSampleCount = Array.isArray(gatewayRecentEvents)
    ? gatewayRecentEvents.slice(0, 10).length
    : 0;
  const gatewayLiveBodyProps = {
    activePanel,
    appliedGatewaySessionChannelFilter,
    appliedGatewaySessionProviderFilter,
    appliedGatewaySessionStatusInputValue,
    buildEventsCsv,
    closeInfoMessage,
    compactInfoMessage,
    eventQuery,
    eventsLimit,
    eventTypeFilter,
    gatewayError,
    gatewayOverview,
    gatewayRecentEvents,
    gatewaySessionScopeLabel,
    gatewaySessions,
    gatewaySessionsSource,
    gatewaySourceFilter,
    hours,
    keepRecentValue,
    selectedSession,
    selectedSessionClosed,
    selectedSessionId,
    toDurationText,
    topGatewayProvider,
  };
  const gatewayTelemetryBodyProps = {
    activePanel,
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionStatusInputValue,
    channelUsageCard: (
      <BreakdownListCard
        emptyLabel="No channel usage in current sample."
        items={gatewayTelemetryChannelUsage}
        title="Channel usage (sample)"
      />
    ),
    compactionTrendCard: (
      <GatewayCompactionHourlyTrendCard
        compactEmptyState
        emptyLabel="No compaction events in current sample."
        items={gatewayCompactionHourlyTrend}
        title="Gateway compaction trend (UTC)"
      />
    ),
    eventCounters: gatewayEventCounters,
    eventQuery,
    eventsLimit,
    eventTypeFilter,
    gatewayScopeOverridesApplied,
    gatewayScopeRows,
    gatewaySourceFilter,
    hours,
    providerUsageCard: (
      <BreakdownListCard
        emptyLabel="No provider usage in current sample."
        items={gatewayTelemetryProviderUsage}
        title="Provider usage (sample)"
      />
    ),
    resetScopeHref: buildPanelHref(activePanel),
    riskSignals: gatewayRiskSignalsView,
    selectedSessionId,
    statCards: gatewayTelemetryStatCards,
    telemetryError: gatewayTelemetryError,
    thresholdsCard: (
      <GatewayTelemetryThresholdsCard thresholds={gatewayTelemetryThresholds} />
    ),
  };
  const runtimeBodyProps = {
    aiFailuresCsv,
    aiPrompt,
    aiProvidersCsv,
    aiRole,
    aiRuntimeDryRunErrorMessage,
    aiRuntimeDryRunInfoMessage,
    aiRuntimeDryRunResult,
    aiRuntimeHealthError,
    aiRuntimeHealthGeneratedAt,
    aiRuntimeProviders,
    aiRuntimeRoleStates: aiRuntimeRoleStatesBase,
    aiRuntimeSummary,
    aiTimeoutMs,
    hours,
    panel: activePanel,
    roleOptions: [...AI_RUNTIME_ROLES],
    scopeFields: {
      eventQuery,
      eventTypeFilter,
      eventsLimit,
      gatewaySessionStatusInputValue: appliedGatewaySessionStatusInputValue,
      gatewaySourceFilter,
      selectedSessionId,
      sessionChannelFilter: appliedGatewaySessionChannelFilter,
      sessionProviderFilter: appliedGatewaySessionProviderFilter,
    },
  };
  const gatewayPanelsProps = {
    gatewayHealthBadgeClassName: healthBadgeClass(gatewayHealthLevel),
    gatewayHealthLabel: healthLabel(gatewayHealthLevel),
    liveBodyProps: gatewayLiveBodyProps,
    showGatewayHealthBadge: gatewayOverview !== null,
    telemetryBodyProps: gatewayTelemetryBodyProps,
    telemetryHealthBadgeClassName: healthBadgeClass(
      resolvedGatewayTelemetryHealthLevel,
    ),
    telemetryHealthLabel: healthLabel(resolvedGatewayTelemetryHealthLevel),
  };
  const runtimePanelProps = {
    bodyProps: runtimeBodyProps,
    runtimeHealthBadgeClassName: healthBadgeClass(aiRuntimeHealthLevel),
    runtimeHealthLabel: healthLabel(aiRuntimeHealthLevel),
  };
  const engagementOverviewProps = {
    digestOpenRateText: toRateText(kpis.digestOpenRate),
    engagementAvgSessionSeconds,
    engagementSessionCount,
    followRateText: toRateText(kpis.followRate),
    return24hRateText: toRateText(kpis.return24h),
    shouldCompact: shouldCompactEngagementOverview,
  };
  const engagementHealthProps = {
    signals: engagementHealthSignals,
  };
  const releaseHealthSectionProps = {
    breakdownRows: releaseBreakdownRows,
    hourlyTrendCard: (
      <ReleaseHealthAlertHourlyTrendCard
        compactEmptyState
        emptyLabel="No release-health alert hourly trend data in current window."
        items={releaseHealthAlertHourlyTrend}
        title="Release-health alert hourly trend (UTC)"
      />
    ),
    releaseAlertsCount: `${releaseHealthAlertCount}`,
    releaseFirstAppearancesCount: `${releaseHealthAlertFirstAppearanceCount}`,
    releaseLatestReceivedAt: releaseHealthAlertLatestReceivedAt,
    releaseLatestRunLabel: releaseHealthAlertLatestRunLabel,
    releaseLatestRunUrl:
      typeof releaseHealthAlertLatest?.runUrl === 'string'
        ? releaseHealthAlertLatest.runUrl
        : null,
    releaseRiskBadgeClassName: healthBadgeClass(releaseHealthAlertRiskLevel),
    releaseRiskLabel: healthLabel(releaseHealthAlertRiskLevel),
    releaseRunsCount: `${releaseHealthAlertedRunCount}`,
  };
  const feedPreferenceKpisProps = {
    comfortDensityShareText: toRateText(kpis.densityComfortRate),
    compactDensityShareText: toRateText(kpis.densityCompactRate),
    hintDismissRateText: toRateText(kpis.hintDismissRate),
    legacyFocusShareText: toRateText(kpis.viewModeFocusRate),
    observerModeShareText: toRateText(kpis.viewModeObserverRate),
    shouldCompact: shouldCompactFeedPreferenceKpis,
  };
  const multimodalTelemetrySectionProps = {
    breakdownRows: multimodalBreakdownRows,
    coverageRiskBadgeClassName: healthBadgeClass(multimodalOverallLevel),
    coverageRiskLabel: healthLabel(multimodalOverallLevel),
    hourlyTrendCard: (
      <HourlyTrendCard
        compactEmptyState
        emptyLabel="No hourly multimodal trend data in current window."
        items={multimodalHourlyTrend}
        title="Hourly trend (UTC)"
      />
    ),
    invalidQueryErrorsValue: `${toNumber(multimodalGuardrails.invalidQueryErrors)}`,
    invalidQueryShareText: toRateText(multimodalGuardrails.invalidQueryRate),
    multimodalStatCards,
  };
  const predictionMarketSectionProps = {
    accuracyBadgeClassName: healthBadgeClass(predictionAccuracyLevel),
    accuracyLabel: healthLabel(predictionAccuracyLevel),
    averageStakeText: toFixedText(predictionTotals.averageStakePoints),
    cohortsByOutcomeRows: predictionCohortsByOutcomeView,
    cohortsByStakeBandRows: predictionCohortsByStakeBandView,
    cohortThresholdSummary: predictionCohortThresholdSummary,
    correctPredictions: toNumber(predictionTotals.correctPredictions),
    filterScopeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No scope-switch data in current window."
        items={predictionFilterByScopeBreakdown}
        title="Filter scope mix"
      />
    ),
    filterSwitchesValue: `${toNumber(predictionFilterTelemetry.totalSwitches)}`,
    filterSwitchShareText: toRateText(kpis.predictionFilterSwitchShare),
    filterValueMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No filter-value data in current window."
        items={predictionFilterByFilterBreakdown}
        title="Filter value mix"
      />
    ),
    historyScopeRows: predictionHistoryScopeStates,
    hourlyTrendCard: (
      <PredictionHourlyTrendCard
        compactEmptyState
        emptyLabel="No hourly prediction trend data in current window."
        items={predictionHourlyTrend}
        title="Prediction hourly trend (UTC)"
      />
    ),
    nonDefaultSortShareText: toRateText(kpis.predictionNonDefaultSortRate),
    outcomeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No prediction outcomes in current window."
        items={predictionOutcomesBreakdown}
        title="Outcome mix"
      />
    ),
    participationRateText: toRateText(kpis.predictionParticipationRate),
    predictionStatCards,
    resolvedPredictions: toNumber(predictionTotals.resolvedPredictions),
    scopeFilterMatrixRows: predictionFilterByScopeAndFilter,
    scopeSortMatrixRows: predictionSortByScopeAndSort,
    sortScopeMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No sort scope data in current window."
        items={predictionSortByScopeBreakdown}
        title="Sort scope mix"
      />
    ),
    sortSwitchesValue: `${toNumber(predictionSortTelemetry.totalSwitches)}`,
    sortSwitchShareText: toRateText(kpis.predictionSortSwitchShare),
    sortValueMixCard: (
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No sort-value data in current window."
        items={predictionSortBySortBreakdown}
        title="Sort value mix"
      />
    ),
    window30d: predictionWindow30dView,
    window7d: predictionWindow7dView,
    windowThresholdCriticalText: toRateText(
      predictionResolutionWindowThresholds.accuracyRate.criticalBelow,
    ),
    windowThresholdMinSample:
      predictionResolutionWindowThresholds.minResolvedPredictions,
    windowThresholdWatchText: toRateText(
      predictionResolutionWindowThresholds.accuracyRate.watchBelow,
    ),
  };
  const styleFusionMetricsSectionProps = {
    copyRiskBadgeClassName: healthBadgeClass(styleFusionCopyRiskLevel),
    copyRiskLabel: healthLabel(styleFusionCopyRiskLevel),
    fusionRiskBadgeClassName: healthBadgeClass(styleFusionRiskLevel),
    fusionRiskLabel: healthLabel(styleFusionRiskLevel),
    metrics: styleFusionMetrics,
  };
  const debugDiagnosticsSectionProps = {
    attentionSessionsCount: `${toNumber(gatewayTelemetrySessions.attention)}`,
    debugContextRows,
    debugPayloadText,
    eventsSampleCount: debugEventsSampleCount,
    releaseAlertsCount: `${releaseHealthAlertCount}`,
    runtimeProvidersCount: aiRuntimeProviders.length,
  };
  const feedInteractionCountersProps = {
    density: {
      comfort: toNumber(density.comfort),
      compact: toNumber(density.compact),
      total: densityTotal,
      unknown: toNumber(density.unknown),
    },
    hint: {
      dismissCount: toNumber(hint.dismissCount),
      switchCount: toNumber(hint.switchCount),
      total: hintInteractionTotal,
    },
    shouldCompact: shouldCompactFeedPreferenceEvents,
    viewMode: {
      focus: toNumber(viewMode.focus),
      observer: toNumber(viewMode.observer),
      total: viewModeTotal,
      unknown: toNumber(viewMode.unknown),
    },
  };
  const topSegmentsProps = {
    shouldCompactFeedPreferenceEvents,
    topSegments: topSegmentsView,
  };

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4" id="main-content">
      <header className="card p-4 sm:p-5">
        <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
          Admin UX Metrics
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Observer engagement and feed preference telemetry. Window:{' '}
          {toNumber(data?.windowHours, hours)}h
        </p>
      </header>

      <AdminUxPanelChrome
        activePanel={activePanel}
        panelTabs={panelTabsView}
        stickyKpis={stickyKpisView}
      />
      <AdminUxMainPanels
        activePanel={activePanel}
        debugDiagnosticsSectionProps={debugDiagnosticsSectionProps}
        engagementHealthProps={engagementHealthProps}
        engagementOverviewProps={engagementOverviewProps}
        feedInteractionCountersProps={feedInteractionCountersProps}
        feedPreferenceKpisProps={feedPreferenceKpisProps}
        gatewayPanelsProps={gatewayPanelsProps}
        multimodalTelemetrySectionProps={multimodalTelemetrySectionProps}
        predictionMarketSectionProps={predictionMarketSectionProps}
        releaseHealthSectionProps={releaseHealthSectionProps}
        runtimePanelProps={runtimePanelProps}
        styleFusionMetricsSectionProps={styleFusionMetricsSectionProps}
        topSegmentsProps={topSegmentsProps}
      />
    </main>
  );
}
