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
import {
  deriveAiRuntimeHealthLevel,
  deriveGatewayHealthLevel,
  deriveReleaseHealthAlertRiskLevel,
  healthBadgeClass,
  healthLabel,
  normalizeBreakdownItems,
  normalizeGatewayCompactionHourlyTrendItems,
  normalizeGatewayTelemetryFilters,
  normalizeGatewayTelemetryThresholds,
  normalizeHourlyTrendItems,
  normalizePredictionCohortByOutcomeItems,
  normalizePredictionCohortByStakeBandItems,
  normalizePredictionCohortRiskThresholds,
  normalizePredictionFilterScopeFilterItems,
  normalizePredictionHistoryScopeStateItems,
  normalizePredictionHourlyTrendItems,
  normalizePredictionResolutionWindow,
  normalizePredictionResolutionWindowThresholds,
  normalizePredictionSortScopeSortItems,
  normalizeReleaseHealthAlertHourlyTrendItems,
  normalizeStyleFusionMetrics,
  pickFirstFiniteRate,
  resolveGatewaySessionScope,
  resolveGatewayTelemetryHealthLevel,
  resolveHealthLevel,
  resolvePredictionCohortHealthLevel,
  resolvePredictionResolutionWindowHealthLevel,
  resolveRiskHealthLevel,
  toDurationText,
  toFixedText,
  toHealthLevelValue,
  toNullableIsoTimestamp,
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
import {
  buildDebugContextRows,
  buildDebugPayloadText,
  buildEngagementCompactionView,
  buildEngagementHealthSignals,
  buildGatewayEventCounters,
  buildGatewayRiskSignalsView,
  buildGatewayScopeRows,
  buildGatewayTelemetryStatCards,
  buildGatewayTelemetryView,
  buildMultimodalBreakdownRows,
  buildMultimodalStatCards,
  buildMultimodalTelemetryView,
  buildPanelTabsView,
  buildPredictionCohortsByOutcomeView,
  buildPredictionCohortsByStakeBandView,
  buildPredictionMarketTelemetryView,
  buildPredictionStatCards,
  buildPredictionWindowView,
  buildReleaseBreakdownRows,
  buildReleaseHealthAlertsView,
  buildStickyKpisView,
  buildTopSegmentsView,
} from './components/admin-ux-view-models';
import {
  AI_RUNTIME_ROLES,
  fetchAiRuntimeHealth,
  recomputeAiRuntimeSummary,
  resolveAiRuntimeDryRunState,
  resolveAiRuntimeQueryState,
} from './components/ai-runtime-orchestration';
import { DebugDiagnosticsSection } from './components/debug-diagnostics-section';
import {
  EngagementHealthSection,
  EngagementOverviewSection,
  FeedInteractionCountersSection,
  FeedPreferenceKpisSection,
  TopSegmentsSection,
} from './components/engagement-sections';
import {
  resolveGatewayEventsRequestFilters,
  resolveGatewayQueryState,
  resolveGatewaySessionMutations,
} from './components/gateway-query-state';
import {
  GatewayPanels,
  RuntimePanel,
} from './components/gateway-runtime-panels';
import { resolveGatewaySessionOrchestrationState } from './components/gateway-session-orchestration';
import { MultimodalTelemetrySection } from './components/multimodal-telemetry-section';
import { PredictionMarketSection } from './components/prediction-market-section';
import { ReleaseHealthSection } from './components/release-health-section';
import { StyleFusionMetricsSection } from './components/style-fusion-metrics-section';
import {
  BreakdownListCard,
  GatewayCompactionHourlyTrendCard,
  GatewayTelemetryThresholdsCard,
  HourlyTrendCard,
  PredictionHourlyTrendCard,
  ReleaseHealthAlertHourlyTrendCard,
} from './components/telemetry-shared-cards';

const PREDICTION_OUTCOME_LABEL_SEGMENT_PATTERN = /[_\s-]+/;

const formatPredictionOutcomeMetricLabel = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'merge') {
    return 'Merge';
  }
  if (normalized === 'reject') {
    return 'Reject';
  }
  if (normalized.length === 0) {
    return 'Unknown';
  }
  return normalized
    .split(PREDICTION_OUTCOME_LABEL_SEGMENT_PATTERN)
    .filter((segment) => segment.length > 0)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
};

const resolveGatewaySessionMutationsWithApi = (args: {
  closeRequested: boolean;
  compactRequested: boolean;
  selectedSessionClosed: boolean;
  selectedSessionId: string | null;
  keepRecent?: number;
}) =>
  resolveGatewaySessionMutations({
    ...args,
    closeAgentGatewaySession,
    compactAgentGatewaySession,
  });

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
    resolveGatewaySessionMutations: resolveGatewaySessionMutationsWithApi,
    sessionIdFromQuery,
    toStringValue,
  });

  const kpis = data?.kpis ?? {};
  const predictionMarket = data?.predictionMarket ?? {};
  const predictionFilterTelemetry = data?.predictionFilterTelemetry ?? {};
  const predictionSortTelemetry = data?.predictionSortTelemetry ?? {};
  const predictionHistoryStateTelemetry =
    data?.predictionHistoryStateTelemetry ?? {};
  const {
    predictionCohortThresholdSummary,
    predictionCohortsByOutcomeWithRisk,
    predictionCohortsByStakeBandWithRisk,
    predictionFilterByFilterBreakdown,
    predictionFilterByScopeAndFilter,
    predictionFilterByScopeBreakdown,
    predictionHistoryScopeStates,
    predictionHourlyTrend,
    predictionOutcomesBreakdown,
    predictionResolutionWindowThresholds,
    predictionSortByScopeAndSort,
    predictionSortByScopeBreakdown,
    predictionSortBySortBreakdown,
    predictionTotals,
    predictionWindow30d,
    predictionWindow30dRiskLevel,
    predictionWindow7d,
    predictionWindow7dRiskLevel,
  } = buildPredictionMarketTelemetryView({
    formatPredictionOutcomeMetricLabel,
    normalizeBreakdownItems,
    normalizePredictionCohortByOutcomeItems,
    normalizePredictionCohortByStakeBandItems,
    normalizePredictionCohortRiskThresholds,
    normalizePredictionFilterScopeFilterItems,
    normalizePredictionHistoryScopeStateItems,
    normalizePredictionHourlyTrendItems,
    normalizePredictionResolutionWindow,
    normalizePredictionResolutionWindowThresholds,
    normalizePredictionSortScopeSortItems,
    predictionFilterTelemetry,
    predictionHistoryStateTelemetry,
    predictionMarket,
    predictionSortTelemetry,
    resolvePredictionCohortHealthLevel,
    resolvePredictionResolutionWindowHealthLevel,
    toRateText,
  });
  const multimodal = data?.multimodal ?? {};
  const {
    multimodalCoverageRate,
    multimodalEmptyReasonBreakdown,
    multimodalErrorRate,
    multimodalErrorReasonBreakdown,
    multimodalGuardrails,
    multimodalHourlyTrend,
    multimodalOverallLevel,
    multimodalProviderBreakdown,
  } = buildMultimodalTelemetryView({
    kpis,
    multimodal,
    normalizeBreakdownItems,
    normalizeHourlyTrendItems,
    pickFirstFiniteRate,
    resolveHealthLevel,
    resolveRiskHealthLevel,
  });
  const releaseHealthAlerts = data?.releaseHealthAlerts ?? {};
  const {
    releaseHealthAlertByChannel,
    releaseHealthAlertByFailureMode,
    releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertHourlyTrend,
    releaseHealthAlertLatest,
    releaseHealthAlertLatestReceivedAt,
    releaseHealthAlertLatestRunLabel,
    releaseHealthAlertRiskLevel,
    releaseHealthAlertedRunCount,
  } = buildReleaseHealthAlertsView({
    deriveReleaseHealthAlertRiskLevel,
    kpis,
    normalizeBreakdownItems,
    normalizeReleaseHealthAlertHourlyTrendItems,
    releaseHealthAlerts,
    toNullableIsoTimestamp,
    toNumber,
  });
  const feedPreferences = data?.feedPreferences ?? {};
  const viewMode = feedPreferences.viewMode ?? {};
  const density = feedPreferences.density ?? {};
  const hint = feedPreferences.hint ?? {};
  const {
    densityTotal,
    engagementAvgSessionSeconds,
    engagementSessionCount,
    hintInteractionTotal,
    shouldCompactEngagementOverview,
    shouldCompactFeedPreferenceEvents,
    shouldCompactFeedPreferenceKpis,
    viewModeTotal,
  } = buildEngagementCompactionView({
    feedPreferences,
    kpis,
    toNumber,
  });
  const segments = Array.isArray(data?.segments) ? data?.segments : [];
  const styleFusionMetrics = normalizeStyleFusionMetrics(similarSearchMetrics);
  const styleFusionRiskLevel = resolveHealthLevel(
    styleFusionMetrics.successRate,
    {
      criticalBelow: 0.5,
      watchBelow: 0.7,
    },
  );
  const styleFusionCopyRiskLevel = resolveHealthLevel(
    styleFusionMetrics.copy.successRate,
    {
      criticalBelow: 0.6,
      watchBelow: 0.8,
    },
  );
  const topSegmentsView = buildTopSegmentsView({ segments, toNumber });
  const gatewayProviders = gatewayOverview
    ? Object.entries(gatewayOverview.summary.providerUsage).sort(
        (left, right) => right[1] - left[1],
      )
    : [];
  const {
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionChannelFilter,
    appliedGatewaySessionProviderFilter,
    appliedGatewaySessionStatusInputValue,
    appliedGatewaySessionStatusLabel,
    gatewayAutoCompactionShareLevel,
    gatewayCompactionHourlyTrend,
    gatewayCooldownSkipLevel,
    gatewayFailedStepLevel,
    gatewayRuntimeSuccessLevel,
    gatewaySessionScopeLabel,
    gatewayTelemetryAttempts,
    gatewayTelemetryChannelUsage,
    gatewayTelemetryEvents,
    gatewayTelemetryProviderUsage,
    gatewayTelemetrySessions,
    gatewayTelemetryThresholds,
    resolvedGatewayTelemetryHealthLevel,
  } = buildGatewayTelemetryView({
    gatewayChannelFilter,
    gatewayProviderFilter,
    gatewaySessionFilters,
    gatewayStatusFilter,
    gatewayTelemetry,
    normalizeBreakdownItems,
    normalizeGatewayCompactionHourlyTrendItems,
    normalizeGatewayTelemetryFilters,
    normalizeGatewayTelemetryThresholds,
    resolveGatewaySessionScope,
    resolveGatewayTelemetryHealthLevel,
    resolveHealthLevel,
    resolveRiskHealthLevel,
    toHealthLevelValue,
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
  const topGatewayProvider = gatewayProviders[0] ?? null;
  const gatewayHealthLevel = deriveGatewayHealthLevel(gatewayOverview);
  const engagementHealthSignals = buildEngagementHealthSignals({
    healthBadgeClass,
    healthLabel,
    kpis,
    resolveHealthLevel,
    toRateText,
  });
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
  const isPanelVisible = (panel: Exclude<AdminUxPanel, 'all'>) =>
    activePanel === 'all' || activePanel === panel;
  const isDebugPanelVisible = activePanel === 'debug';
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
  const releaseBreakdownRows = buildReleaseBreakdownRows({
    byChannel: releaseHealthAlertByChannel,
    byFailureMode: releaseHealthAlertByFailureMode,
  });
  const multimodalBreakdownRows = buildMultimodalBreakdownRows({
    emptyReasonBreakdown: multimodalEmptyReasonBreakdown,
    errorReasonBreakdown: multimodalErrorReasonBreakdown,
    providerBreakdown: multimodalProviderBreakdown,
  });
  const multimodalStatCards = buildMultimodalStatCards({
    multimodal,
    multimodalCoverageRate,
    multimodalErrorRate,
    toNumber,
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
  const gatewayRiskSignalsView = buildGatewayRiskSignalsView({
    autoCompactionLevel: gatewayAutoCompactionShareLevel,
    cooldownSkipLevel: gatewayCooldownSkipLevel,
    failedStepLevel: gatewayFailedStepLevel,
    healthBadgeClass,
    healthLabel,
    runtimeSuccessLevel: gatewayRuntimeSuccessLevel,
  });
  const gatewayScopeOverridesApplied =
    (gatewaySourceFilter ?? '').length > 0 ||
    (appliedGatewayChannelFilter ?? '').length > 0 ||
    (appliedGatewayProviderFilter ?? '').length > 0 ||
    (appliedGatewaySessionStatusInputValue ?? '').length > 0;
  const gatewayScopeRows = buildGatewayScopeRows({
    appliedGatewayChannelFilter,
    appliedGatewayProviderFilter,
    appliedGatewaySessionStatusLabel,
    gatewaySourceFilter,
  });
  const gatewayTelemetryStatCards = buildGatewayTelemetryStatCards({
    attempts: gatewayTelemetryAttempts,
    events: gatewayTelemetryEvents,
    sessions: gatewayTelemetrySessions,
    toNumber,
    toRateText,
  });
  const gatewayEventCounters = buildGatewayEventCounters({
    events: gatewayTelemetryEvents,
    toNumber,
  });
  const predictionAccuracyLevel = resolveHealthLevel(
    kpis.predictionAccuracyRate,
    {
      criticalBelow: 0.45,
      watchBelow: 0.6,
    },
  );
  const predictionStatCards = buildPredictionStatCards({
    kpis,
    predictionTotals,
    toNumber,
    toRateText,
  });
  const predictionWindow7dView = buildPredictionWindowView({
    healthBadgeClass,
    healthLabel,
    riskLevel: predictionWindow7dRiskLevel,
    toRateText,
    window: predictionWindow7d,
  });
  const predictionWindow30dView = buildPredictionWindowView({
    healthBadgeClass,
    healthLabel,
    riskLevel: predictionWindow30dRiskLevel,
    toRateText,
    window: predictionWindow30d,
  });
  const predictionCohortsByOutcomeView = buildPredictionCohortsByOutcomeView({
    healthBadgeClass,
    healthLabel,
    rows: predictionCohortsByOutcomeWithRisk,
    toOutcomeLabel: formatPredictionOutcomeMetricLabel,
    toRateText,
  });
  const predictionCohortsByStakeBandView =
    buildPredictionCohortsByStakeBandView({
      healthBadgeClass,
      healthLabel,
      rows: predictionCohortsByStakeBandWithRisk,
      toRateText,
    });
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

      <GatewayPanels
        gatewayHealthBadgeClassName={healthBadgeClass(gatewayHealthLevel)}
        gatewayHealthLabel={healthLabel(gatewayHealthLevel)}
        isVisible={isPanelVisible('gateway')}
        liveBodyProps={gatewayLiveBodyProps}
        showGatewayHealthBadge={gatewayOverview !== null}
        telemetryBodyProps={gatewayTelemetryBodyProps}
        telemetryHealthBadgeClassName={healthBadgeClass(
          resolvedGatewayTelemetryHealthLevel,
        )}
        telemetryHealthLabel={healthLabel(resolvedGatewayTelemetryHealthLevel)}
      />

      <RuntimePanel
        bodyProps={runtimeBodyProps}
        isVisible={isPanelVisible('runtime')}
        runtimeHealthBadgeClassName={healthBadgeClass(aiRuntimeHealthLevel)}
        runtimeHealthLabel={healthLabel(aiRuntimeHealthLevel)}
      />

      <EngagementOverviewSection
        digestOpenRateText={toRateText(kpis.digestOpenRate)}
        engagementAvgSessionSeconds={engagementAvgSessionSeconds}
        engagementSessionCount={engagementSessionCount}
        followRateText={toRateText(kpis.followRate)}
        isVisible={isPanelVisible('engagement')}
        return24hRateText={toRateText(kpis.return24h)}
        shouldCompact={shouldCompactEngagementOverview}
      />

      <EngagementHealthSection
        isVisible={isPanelVisible('engagement')}
        signals={engagementHealthSignals}
      />
      {isPanelVisible('release') ? (
        <ReleaseHealthSection
          breakdownRows={releaseBreakdownRows}
          hourlyTrendCard={
            <ReleaseHealthAlertHourlyTrendCard
              compactEmptyState
              emptyLabel="No release-health alert hourly trend data in current window."
              items={releaseHealthAlertHourlyTrend}
              title="Release-health alert hourly trend (UTC)"
            />
          }
          releaseAlertsCount={`${releaseHealthAlertCount}`}
          releaseFirstAppearancesCount={`${releaseHealthAlertFirstAppearanceCount}`}
          releaseLatestReceivedAt={releaseHealthAlertLatestReceivedAt}
          releaseLatestRunLabel={releaseHealthAlertLatestRunLabel}
          releaseLatestRunUrl={
            typeof releaseHealthAlertLatest?.runUrl === 'string'
              ? releaseHealthAlertLatest.runUrl
              : null
          }
          releaseRiskBadgeClassName={healthBadgeClass(
            releaseHealthAlertRiskLevel,
          )}
          releaseRiskLabel={healthLabel(releaseHealthAlertRiskLevel)}
          releaseRunsCount={`${releaseHealthAlertedRunCount}`}
        />
      ) : null}

      <FeedPreferenceKpisSection
        comfortDensityShareText={toRateText(kpis.densityComfortRate)}
        compactDensityShareText={toRateText(kpis.densityCompactRate)}
        hintDismissRateText={toRateText(kpis.hintDismissRate)}
        isVisible={isPanelVisible('engagement')}
        legacyFocusShareText={toRateText(kpis.viewModeFocusRate)}
        observerModeShareText={toRateText(kpis.viewModeObserverRate)}
        shouldCompact={shouldCompactFeedPreferenceKpis}
      />

      {isPanelVisible('style') ? (
        <MultimodalTelemetrySection
          breakdownRows={multimodalBreakdownRows}
          coverageRiskBadgeClassName={healthBadgeClass(multimodalOverallLevel)}
          coverageRiskLabel={healthLabel(multimodalOverallLevel)}
          hourlyTrendCard={
            <HourlyTrendCard
              compactEmptyState
              emptyLabel="No hourly multimodal trend data in current window."
              items={multimodalHourlyTrend}
              title="Hourly trend (UTC)"
            />
          }
          invalidQueryErrorsValue={`${toNumber(multimodalGuardrails.invalidQueryErrors)}`}
          invalidQueryShareText={toRateText(
            multimodalGuardrails.invalidQueryRate,
          )}
          multimodalStatCards={multimodalStatCards}
        />
      ) : null}

      {isPanelVisible('prediction') ? (
        <PredictionMarketSection
          accuracyBadgeClassName={healthBadgeClass(predictionAccuracyLevel)}
          accuracyLabel={healthLabel(predictionAccuracyLevel)}
          averageStakeText={toFixedText(predictionTotals.averageStakePoints)}
          cohortsByOutcomeRows={predictionCohortsByOutcomeView}
          cohortsByStakeBandRows={predictionCohortsByStakeBandView}
          cohortThresholdSummary={predictionCohortThresholdSummary}
          correctPredictions={toNumber(predictionTotals.correctPredictions)}
          filterScopeMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No scope-switch data in current window."
              items={predictionFilterByScopeBreakdown}
              title="Filter scope mix"
            />
          }
          filterSwitchesValue={`${toNumber(predictionFilterTelemetry.totalSwitches)}`}
          filterSwitchShareText={toRateText(kpis.predictionFilterSwitchShare)}
          filterValueMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No filter-value data in current window."
              items={predictionFilterByFilterBreakdown}
              title="Filter value mix"
            />
          }
          historyScopeRows={predictionHistoryScopeStates}
          hourlyTrendCard={
            <PredictionHourlyTrendCard
              compactEmptyState
              emptyLabel="No hourly prediction trend data in current window."
              items={predictionHourlyTrend}
              title="Prediction hourly trend (UTC)"
            />
          }
          nonDefaultSortShareText={toRateText(
            kpis.predictionNonDefaultSortRate,
          )}
          outcomeMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No prediction outcomes in current window."
              items={predictionOutcomesBreakdown}
              title="Outcome mix"
            />
          }
          participationRateText={toRateText(kpis.predictionParticipationRate)}
          predictionStatCards={predictionStatCards}
          resolvedPredictions={toNumber(predictionTotals.resolvedPredictions)}
          scopeFilterMatrixRows={predictionFilterByScopeAndFilter}
          scopeSortMatrixRows={predictionSortByScopeAndSort}
          sortScopeMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No sort scope data in current window."
              items={predictionSortByScopeBreakdown}
              title="Sort scope mix"
            />
          }
          sortSwitchesValue={`${toNumber(predictionSortTelemetry.totalSwitches)}`}
          sortSwitchShareText={toRateText(kpis.predictionSortSwitchShare)}
          sortValueMixCard={
            <BreakdownListCard
              compactEmptyState
              emptyLabel="No sort-value data in current window."
              items={predictionSortBySortBreakdown}
              title="Sort value mix"
            />
          }
          window7d={predictionWindow7dView}
          window30d={predictionWindow30dView}
          windowThresholdCriticalText={toRateText(
            predictionResolutionWindowThresholds.accuracyRate.criticalBelow,
          )}
          windowThresholdMinSample={
            predictionResolutionWindowThresholds.minResolvedPredictions
          }
          windowThresholdWatchText={toRateText(
            predictionResolutionWindowThresholds.accuracyRate.watchBelow,
          )}
        />
      ) : null}
      {isPanelVisible('style') ? (
        <StyleFusionMetricsSection
          copyRiskBadgeClassName={healthBadgeClass(styleFusionCopyRiskLevel)}
          copyRiskLabel={healthLabel(styleFusionCopyRiskLevel)}
          fusionRiskBadgeClassName={healthBadgeClass(styleFusionRiskLevel)}
          fusionRiskLabel={healthLabel(styleFusionRiskLevel)}
          metrics={styleFusionMetrics}
        />
      ) : null}

      {isDebugPanelVisible ? (
        <DebugDiagnosticsSection
          attentionSessionsCount={`${toNumber(gatewayTelemetrySessions.attention)}`}
          debugContextRows={debugContextRows}
          debugPayloadText={debugPayloadText}
          eventsSampleCount={debugEventsSampleCount}
          releaseAlertsCount={`${releaseHealthAlertCount}`}
          runtimeProvidersCount={aiRuntimeProviders.length}
        />
      ) : null}

      <FeedInteractionCountersSection
        density={{
          comfort: toNumber(density.comfort),
          compact: toNumber(density.compact),
          total: densityTotal,
          unknown: toNumber(density.unknown),
        }}
        hint={{
          dismissCount: toNumber(hint.dismissCount),
          switchCount: toNumber(hint.switchCount),
          total: hintInteractionTotal,
        }}
        isVisible={isPanelVisible('engagement')}
        shouldCompact={shouldCompactFeedPreferenceEvents}
        viewMode={{
          focus: toNumber(viewMode.focus),
          observer: toNumber(viewMode.observer),
          total: viewModeTotal,
          unknown: toNumber(viewMode.unknown),
        }}
      />

      <TopSegmentsSection
        isVisible={isPanelVisible('engagement')}
        shouldCompactFeedPreferenceEvents={shouldCompactFeedPreferenceEvents}
        topSegments={topSegmentsView}
      />
    </main>
  );
}
