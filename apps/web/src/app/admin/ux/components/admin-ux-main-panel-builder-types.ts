import type { ComponentProps } from 'react';

import type {
  AgentGatewayOverview,
  AgentGatewayRecentEvent,
  AgentGatewaySessionListItem,
  AgentGatewayTelemetryResponse,
} from './admin-ux-data-client';
import type { AdminUxMainPanels } from './admin-ux-main-panels';
import type { HealthLevel } from './admin-ux-mappers';
import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsRiskTone,
  AdminUxAllMetricsSignalFilter,
  AdminUxAllMetricsView,
  AdminUxPanel,
} from './admin-ux-page-utils';
import type { AdminUxSectionData } from './admin-ux-section-prep';
import type {
  AIRuntimeDryRunResultViewState,
  AIRuntimeProviderViewState,
  AIRuntimeRoleStateViewState,
  AIRuntimeSummaryViewState,
} from './ai-runtime-orchestration';

export type MainPanelsProps = ComponentProps<typeof AdminUxMainPanels>;
export type BuiltMainPanelsProps = Omit<MainPanelsProps, 'activePanel'>;

export type GatewayPanelsProps = MainPanelsProps['gatewayPanelsProps'];
export type RuntimePanelProps = MainPanelsProps['runtimePanelProps'];
export type DebugDiagnosticsSectionProps =
  MainPanelsProps['debugDiagnosticsSectionProps'];
export type EngagementOverviewProps =
  MainPanelsProps['engagementOverviewProps'];
export type EngagementHealthProps = MainPanelsProps['engagementHealthProps'];
export type ReleaseHealthSectionProps =
  MainPanelsProps['releaseHealthSectionProps'];
export type FeedPreferenceKpisProps =
  MainPanelsProps['feedPreferenceKpisProps'];
export type MultimodalTelemetrySectionProps =
  MainPanelsProps['multimodalTelemetrySectionProps'];
export type PredictionMarketSectionProps =
  MainPanelsProps['predictionMarketSectionProps'];
export type StyleFusionMetricsSectionProps =
  MainPanelsProps['styleFusionMetricsSectionProps'];
export type FeedInteractionCountersProps =
  MainPanelsProps['feedInteractionCountersProps'];
export type TopSegmentsProps = MainPanelsProps['topSegmentsProps'];

export interface GatewayRuntimePanelsBuilderInput {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter: AdminUxAllMetricsRiskFilter;
  allMetricsSignalFilter: AdminUxAllMetricsSignalFilter;
  allMetricsRiskTone: AdminUxAllMetricsRiskTone;
  allMetricsView: AdminUxAllMetricsView;
  aiFailuresCsv: string;
  aiPrompt: string;
  aiProvidersCsv: string;
  aiRole: RuntimePanelProps['bodyProps']['aiRole'];
  aiRuntimeDryRunErrorMessage: string | null;
  aiRuntimeDryRunInfoMessage: string | null;
  aiRuntimeDryRunResult: AIRuntimeDryRunResultViewState | null;
  aiRuntimeHealthError: string | null;
  aiRuntimeHealthGeneratedAt: string | null;
  aiRuntimeHealthLevel: HealthLevel;
  aiRuntimeProviders: AIRuntimeProviderViewState[];
  aiRuntimeRoleStatesBase: AIRuntimeRoleStateViewState[];
  aiRuntimeSummary: AIRuntimeSummaryViewState;
  aiTimeoutMs: number | undefined;
  closeInfoMessage: string | null;
  compactInfoMessage: string | null;
  eventQuery: string;
  eventsLimit: number;
  eventTypeFilter: string;
  expandAllGroups: boolean;
  gatewayChannelFilter: string | null;
  gatewayError: string | null;
  gatewayHealthLevel: HealthLevel;
  gatewayOverview: AgentGatewayOverview | null;
  gatewayProviderFilter: string | null;
  gatewayRecentEvents: AgentGatewayRecentEvent[] | null;
  gatewaySessions: AgentGatewaySessionListItem[];
  gatewaySessionsSource: string;
  gatewaySourceFilter: string | null;
  gatewayStatusFilter: string | null;
  gatewayTelemetry: AgentGatewayTelemetryResponse | null;
  gatewayTelemetryError: string | null;
  hours: number;
  keepRecentValue: number;
  sectionData: AdminUxSectionData;
  selectedSession: AgentGatewaySessionListItem | null;
  selectedSessionClosed: boolean;
  selectedSessionId: string | null;
}

export interface EngagementPanelsBuilderInput {
  sectionData: AdminUxSectionData;
}

export interface BuildAdminUxMainPanelsPropsInput
  extends GatewayRuntimePanelsBuilderInput,
    EngagementPanelsBuilderInput {}
