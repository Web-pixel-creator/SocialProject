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

const toPercentText = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : 'n/a';

const toNullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeHealthLevel = (
  value: unknown,
): 'critical' | 'healthy' | 'unknown' | 'watch' => {
  if (
    value === 'critical' ||
    value === 'healthy' ||
    value === 'unknown' ||
    value === 'watch'
  ) {
    return value;
  }
  return 'unknown';
};

export const buildGatewayRuntimeAndDebugPanelsProps = ({
  activePanel,
  allMetricsRiskFilter,
  allMetricsSignalFilter,
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
  observabilityError,
  observabilitySnapshot,
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
        }${
          allMetricsSignalFilter !== 'all'
            ? `&signal=${allMetricsSignalFilter}`
            : ''
        }${
          allMetricsRiskTone !== 'all' ? `&riskTone=${allMetricsRiskTone}` : ''
        }${expandAllGroups ? '&expand=all' : ''}`
      : `/admin/ux?hours=${hours}&panel=${panel}`;
  const gatewayDebugStatusLabel = toStringValue(
    gatewayOverview?.session.status ?? selectedSession?.status,
    sectionData.appliedGatewaySessionStatusLabel,
  );
  const observabilityHealthLevel = normalizeHealthLevel(
    observabilitySnapshot?.health?.level,
  );
  const observabilityHttpSummary = observabilitySnapshot?.http?.summary;
  const observabilityRuntimeSummary = observabilitySnapshot?.runtime?.summary;
  const observabilityTopRoute = Array.isArray(
    observabilitySnapshot?.http?.routes,
  )
    ? observabilitySnapshot.http.routes[0]
    : null;
  const observabilityApiP95TimingMs = toNullableNumber(
    observabilityHttpSummary?.p95TimingMs,
  );
  const observabilityApiErrorRate = observabilityHttpSummary?.errorRate;
  const observabilityRuntimeFailureRate =
    observabilityRuntimeSummary?.failureRate;
  const observabilityFallbackRate =
    observabilityRuntimeSummary?.fallbackPathUsedRate;
  const observabilityCorrelationCoverage =
    observabilityHttpSummary?.correlationCoverageRate;
  let observabilityInfoMessage =
    'Use this block to compare API latency/errors with sandbox fallback and release-alert signals in one window.';
  if (observabilityError) {
    observabilityInfoMessage = observabilityError;
  }
  if (observabilitySnapshot) {
    observabilityInfoMessage = `Health ${healthLabel(observabilityHealthLevel)}. Top route ${toStringValue(
      observabilityTopRoute?.routeKey,
      'n/a',
    )} in the current ${hours}h window.`;
  }
  const observabilityCards = observabilitySnapshot
    ? [
        {
          hint: 'p95 latency across tracked API routes',
          label: 'API p95',
          value:
            observabilityApiP95TimingMs === null
              ? 'n/a'
              : toDurationText(observabilityApiP95TimingMs),
        },
        {
          hint: 'failed tracked requests in current window',
          label: 'API errors',
          value: toPercentText(observabilityApiErrorRate),
        },
        {
          hint: 'failed sandbox/runtime executions in current window',
          label: 'Runtime failures',
          value: toPercentText(observabilityRuntimeFailureRate),
        },
        {
          hint: 'share of runtime telemetry using fallback path',
          label: 'Fallback path',
          value: toPercentText(observabilityFallbackRate),
        },
        {
          hint: 'request telemetry linked to correlation ids',
          label: 'Correlation coverage',
          value: toPercentText(observabilityCorrelationCoverage),
        },
      ]
    : [];
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
    observabilitySnapshot,
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
    observabilityApiErrorRate: toPercentText(observabilityApiErrorRate),
    observabilityApiP95:
      observabilityApiP95TimingMs === null
        ? 'n/a'
        : toDurationText(observabilityApiP95TimingMs),
    observabilityFallbackRate: toPercentText(observabilityFallbackRate),
    observabilityHealthLabel: healthLabel(observabilityHealthLevel),
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
        allMetricsSignalFilter,
        allMetricsRiskTone,
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
        allMetricsSignalFilter,
        allMetricsRiskTone,
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
        allMetricsSignalFilter,
        allMetricsRiskTone,
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
      observabilityCards,
      observabilityInfoMessage,
      releaseAlertsCount: `${sectionData.releaseHealthAlertCount}`,
      runtimeProvidersCount: aiRuntimeProviders.length,
    },
  };
};
