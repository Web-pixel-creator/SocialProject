import {
  closeAgentGatewaySession,
  compactAgentGatewaySession,
  fetchAgentGatewayOverview,
  fetchAgentGatewayRecentEvents,
  fetchAgentGatewaySessions,
  fetchAgentGatewayTelemetry,
  fetchObserverEngagement,
  fetchSimilarSearchMetrics,
  type ObserverEngagementResponse,
  resolveAdminApiBaseUrl,
  resolveAdminToken,
} from './admin-ux-data-client';
import type { BuiltMainPanelsProps } from './admin-ux-main-panel-builder-types';
import { buildAdminUxMainPanelsProps } from './admin-ux-main-panel-prop-builders';
import {
  deriveAiRuntimeHealthLevel,
  deriveGatewayHealthLevel,
  toNumber,
  toStringValue,
} from './admin-ux-mappers';
import type { AdminUxResolvedSearchParams } from './admin-ux-page-contract';
import {
  resolveAdminUxAllMetricsRiskFilter,
  resolveAdminUxAllMetricsRiskTone,
  resolveAdminUxAllMetricsView,
  resolveAdminUxPanel,
} from './admin-ux-page-utils';
import {
  type AdminUxSectionData,
  prepareAdminUxSectionData,
} from './admin-ux-section-prep';
import {
  fetchAiRuntimeHealth,
  recomputeAiRuntimeSummary,
  resolveAiRuntimeDryRunState,
  resolveAiRuntimeQueryState,
} from './ai-runtime-orchestration';
import {
  resolveGatewayEventsRequestFilters,
  resolveGatewayQueryState,
  resolveGatewaySessionMutations,
} from './gateway-query-state';
import { resolveGatewaySessionOrchestrationState } from './gateway-session-orchestration';

export const resolveAdminUxPageQueryState = (
  resolvedSearchParams?: AdminUxResolvedSearchParams,
) => {
  const rawHours = resolvedSearchParams?.hours;
  const parsedHours =
    typeof rawHours === 'string' ? Number.parseInt(rawHours, 10) : 24;
  const hours = Number.isFinite(parsedHours)
    ? Math.min(Math.max(parsedHours, 1), 720)
    : 24;
  const activePanel = resolveAdminUxPanel(resolvedSearchParams?.panel);
  const allMetricsView = resolveAdminUxAllMetricsView(
    resolvedSearchParams?.allView,
  );
  const allMetricsRiskFilter = resolveAdminUxAllMetricsRiskFilter(
    resolvedSearchParams?.risk,
  );
  const allMetricsRiskTone = resolveAdminUxAllMetricsRiskTone(
    resolvedSearchParams?.riskTone,
  );
  const rawExpandValue = resolvedSearchParams?.expand;
  const expandValue = Array.isArray(rawExpandValue)
    ? rawExpandValue[0]
    : rawExpandValue;
  const expandAllGroups =
    typeof expandValue === 'string' &&
    ['1', 'all', 'expanded', 'true'].includes(expandValue.trim().toLowerCase());

  return {
    activePanel,
    allMetricsRiskFilter,
    allMetricsRiskTone,
    allMetricsView,
    expandAllGroups,
    hours,
    ...resolveGatewayQueryState(resolvedSearchParams),
    ...resolveAiRuntimeQueryState(resolvedSearchParams),
  };
};

export interface AdminUxPageDataLoadSuccess {
  error: null;
  kpis: AdminUxSectionData['kpis'];
  mainPanelsProps: BuiltMainPanelsProps;
  observerData: ObserverEngagementResponse | null;
}

export interface AdminUxPageDataLoadError {
  error: string;
  kpis: null;
  mainPanelsProps: null;
  observerData: null;
}

export type AdminUxPageDataLoadResult =
  | AdminUxPageDataLoadError
  | AdminUxPageDataLoadSuccess;

export const loadAdminUxPageData = async ({
  activePanel,
  aiDryRunRequested,
  aiFailuresCsv,
  aiPrompt,
  aiProvidersCsv,
  aiProvidersOverride,
  aiRole,
  aiSimulateFailures,
  aiTimeoutMs,
  allMetricsRiskFilter,
  allMetricsRiskTone,
  allMetricsView,
  closeRequested,
  compactRequested,
  eventQuery,
  eventsLimit,
  eventTypeFilter,
  expandAllGroups,
  gatewayChannelFilter,
  gatewayProviderFilter,
  gatewaySourceFilter,
  gatewayStatusFilter,
  hours,
  keepRecent,
  sessionIdFromQuery,
}: ReturnType<
  typeof resolveAdminUxPageQueryState
>): Promise<AdminUxPageDataLoadResult> => {
  const { data: observerData, error } = await fetchObserverEngagement(hours);
  const { data: similarSearchMetrics } = await fetchSimilarSearchMetrics(hours);

  if (error) {
    return {
      error,
      kpis: null,
      mainPanelsProps: null,
      observerData: null,
    };
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

  const sectionData = prepareAdminUxSectionData({
    data: observerData,
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

  const mainPanelsProps = buildAdminUxMainPanelsProps({
    activePanel,
    allMetricsRiskFilter,
    allMetricsRiskTone,
    allMetricsView,
    aiFailuresCsv,
    aiPrompt,
    aiProvidersCsv,
    aiRole,
    aiRuntimeDryRunErrorMessage,
    aiRuntimeDryRunInfoMessage,
    aiRuntimeDryRunResult,
    aiRuntimeHealthError,
    aiRuntimeHealthGeneratedAt,
    aiRuntimeHealthLevel,
    aiRuntimeProviders,
    aiRuntimeRoleStatesBase,
    aiRuntimeSummary,
    aiTimeoutMs,
    closeInfoMessage,
    compactInfoMessage,
    eventQuery,
    eventsLimit,
    eventTypeFilter,
    expandAllGroups,
    gatewayChannelFilter,
    gatewayError,
    gatewayHealthLevel,
    gatewayOverview,
    gatewayProviderFilter,
    gatewayRecentEvents,
    gatewaySessions,
    gatewaySessionsSource,
    gatewaySourceFilter,
    gatewayStatusFilter,
    gatewayTelemetry,
    gatewayTelemetryError,
    hours,
    keepRecentValue,
    sectionData,
    selectedSession,
    selectedSessionClosed,
    selectedSessionId,
  });

  return {
    error: null,
    kpis: sectionData.kpis,
    mainPanelsProps,
    observerData,
  };
};
