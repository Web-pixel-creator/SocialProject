import type {
  BuiltMainPanelsProps,
  GatewayRuntimePanelsBuilderInput,
} from './admin-ux-main-panel-builder-types';
import {
  healthBadgeClass,
  healthLabel,
  toDurationText,
  toNumber,
  toStringValue,
} from './admin-ux-mappers';
import { buildEventsCsv } from './admin-ux-page-utils';
import {
  buildDebugContextRows,
  buildDebugPayloadText,
} from './admin-ux-view-models';
import { AI_RUNTIME_ROLES } from './ai-runtime-orchestration';
import {
  BreakdownListCard,
  GatewayCompactionHourlyTrendCard,
  GatewayTelemetryThresholdsCard,
} from './telemetry-shared-cards';

type GatewayRuntimeAndDebugPanelsProps = Pick<
  BuiltMainPanelsProps,
  'debugDiagnosticsSectionProps' | 'gatewayPanelsProps' | 'runtimePanelProps'
>;

export const buildGatewayRuntimeAndDebugPanelsProps = ({
  activePanel,
  allMetricsRiskFilter,
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
}: GatewayRuntimePanelsBuilderInput): GatewayRuntimeAndDebugPanelsProps => {
  const buildPanelHref = (panel: string) =>
    panel === 'all'
      ? `/admin/ux?hours=${hours}&panel=${panel}${
          allMetricsView !== 'overview' ? `&allView=${allMetricsView}` : ''
        }${
          allMetricsRiskFilter !== 'all' ? `&risk=${allMetricsRiskFilter}` : ''
        }${expandAllGroups ? '&expand=all' : ''}`
      : `/admin/ux?hours=${hours}&panel=${panel}`;
  const gatewayDebugStatusLabel = toStringValue(
    gatewayOverview?.session.status ?? selectedSession?.status,
    sectionData.appliedGatewaySessionStatusLabel,
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
    releaseHealthAlertCount: sectionData.releaseHealthAlertCount,
    releaseHealthAlertFirstAppearanceCount:
      sectionData.releaseHealthAlertFirstAppearanceCount,
    releaseHealthAlertLatest: sectionData.releaseHealthAlertLatest,
    releaseHealthAlertedRunCount: sectionData.releaseHealthAlertedRunCount,
  });
  const debugContextRows = buildDebugContextRows({
    activePanel,
    gatewaySessionScopeLabel: sectionData.gatewaySessionScopeLabel,
    gatewaySessionsSource: toStringValue(gatewaySessionsSource, 'n/a'),
    gatewayStatusLabel: gatewayDebugStatusLabel,
    hours,
    releaseRiskLabel: healthLabel(sectionData.releaseHealthAlertRiskLevel),
    runtimeHealthLabel: toStringValue(aiRuntimeSummary.health, 'n/a'),
    selectedSessionId,
  });
  const debugEventsSampleCount = Array.isArray(gatewayRecentEvents)
    ? gatewayRecentEvents.slice(0, 10).length
    : 0;

  return {
    gatewayPanelsProps: {
      gatewayHealthBadgeClassName: healthBadgeClass(gatewayHealthLevel),
      gatewayHealthLabel: healthLabel(gatewayHealthLevel),
      liveBodyProps: {
        activePanel,
        allMetricsRiskFilter,
        allMetricsView,
        appliedGatewaySessionChannelFilter:
          sectionData.appliedGatewaySessionChannelFilter,
        appliedGatewaySessionProviderFilter:
          sectionData.appliedGatewaySessionProviderFilter,
        appliedGatewaySessionStatusInputValue:
          sectionData.appliedGatewaySessionStatusInputValue,
        buildEventsCsv,
        closeInfoMessage,
        compactInfoMessage,
        eventQuery,
        eventsLimit,
        eventTypeFilter,
        expandAllGroups,
        gatewayError,
        gatewayOverview,
        gatewayRecentEvents,
        gatewaySessionScopeLabel: sectionData.gatewaySessionScopeLabel,
        gatewaySessions,
        gatewaySessionsSource,
        gatewaySourceFilter,
        hours,
        keepRecentValue,
        selectedSession,
        selectedSessionClosed,
        selectedSessionId,
        toDurationText,
        topGatewayProvider: sectionData.topGatewayProvider,
      },
      showGatewayHealthBadge: gatewayOverview !== null,
      telemetryBodyProps: {
        activePanel,
        allMetricsRiskFilter,
        allMetricsView,
        appliedGatewayChannelFilter: sectionData.appliedGatewayChannelFilter,
        appliedGatewayProviderFilter: sectionData.appliedGatewayProviderFilter,
        appliedGatewaySessionStatusInputValue:
          sectionData.appliedGatewaySessionStatusInputValue,
        channelUsageCard: (
          <BreakdownListCard
            emptyLabel="No channel usage in current sample."
            items={sectionData.gatewayTelemetryChannelUsage}
            title="Channel usage (sample)"
          />
        ),
        compactionTrendCard: (
          <GatewayCompactionHourlyTrendCard
            compactEmptyState
            emptyLabel="No compaction events in current sample."
            items={sectionData.gatewayCompactionHourlyTrend}
            title="Gateway compaction trend (UTC)"
          />
        ),
        eventCounters: sectionData.gatewayEventCounters,
        eventQuery,
        eventsLimit,
        eventTypeFilter,
        expandAllGroups,
        gatewayScopeOverridesApplied: sectionData.gatewayScopeOverridesApplied,
        gatewayScopeRows: sectionData.gatewayScopeRows,
        gatewaySourceFilter,
        hours,
        providerUsageCard: (
          <BreakdownListCard
            emptyLabel="No provider usage in current sample."
            items={sectionData.gatewayTelemetryProviderUsage}
            title="Provider usage (sample)"
          />
        ),
        resetScopeHref: buildPanelHref(activePanel),
        riskSignals: sectionData.gatewayRiskSignalsView,
        selectedSessionId,
        statCards: sectionData.gatewayTelemetryStatCards,
        telemetryError: gatewayTelemetryError,
        thresholdsCard: (
          <GatewayTelemetryThresholdsCard
            thresholds={sectionData.gatewayTelemetryThresholds}
          />
        ),
      },
      telemetryHealthBadgeClassName: healthBadgeClass(
        sectionData.resolvedGatewayTelemetryHealthLevel,
      ),
      telemetryHealthLabel: healthLabel(
        sectionData.resolvedGatewayTelemetryHealthLevel,
      ),
    },
    runtimePanelProps: {
      bodyProps: {
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
        allMetricsRiskFilter,
        allMetricsView,
        hours,
        panel: activePanel,
        expandAllGroups,
        roleOptions: [...AI_RUNTIME_ROLES],
        scopeFields: {
          eventQuery,
          eventTypeFilter,
          eventsLimit,
          gatewaySessionStatusInputValue:
            sectionData.appliedGatewaySessionStatusInputValue,
          gatewaySourceFilter,
          selectedSessionId,
          sessionChannelFilter: sectionData.appliedGatewaySessionChannelFilter,
          sessionProviderFilter:
            sectionData.appliedGatewaySessionProviderFilter,
        },
      },
      runtimeHealthBadgeClassName: healthBadgeClass(aiRuntimeHealthLevel),
      runtimeHealthLabel: healthLabel(aiRuntimeHealthLevel),
    },
    debugDiagnosticsSectionProps: {
      attentionSessionsCount: `${toNumber(
        sectionData.gatewayTelemetrySessions.attention,
      )}`,
      debugContextRows,
      debugPayloadText,
      eventsSampleCount: debugEventsSampleCount,
      releaseAlertsCount: `${sectionData.releaseHealthAlertCount}`,
      runtimeProvidersCount: aiRuntimeProviders.length,
    },
  };
};
