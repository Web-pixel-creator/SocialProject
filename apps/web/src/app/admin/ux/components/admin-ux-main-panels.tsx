import type { ComponentProps } from 'react';

import type { AdminUxPanel } from './admin-ux-page-utils';
import { DebugDiagnosticsSection } from './debug-diagnostics-section';
import {
  EngagementHealthSection,
  EngagementOverviewSection,
  FeedInteractionCountersSection,
  FeedPreferenceKpisSection,
  TopSegmentsSection,
} from './engagement-sections';
import { GatewayPanels, RuntimePanel } from './gateway-runtime-panels';
import { MultimodalTelemetrySection } from './multimodal-telemetry-section';
import { PredictionMarketSection } from './prediction-market-section';
import { ReleaseHealthSection } from './release-health-section';
import { StyleFusionMetricsSection } from './style-fusion-metrics-section';

export const AdminUxMainPanels = ({
  activePanel,
  debugDiagnosticsSectionProps,
  engagementHealthProps,
  engagementOverviewProps,
  feedInteractionCountersProps,
  feedPreferenceKpisProps,
  gatewayPanelsProps,
  multimodalTelemetrySectionProps,
  predictionMarketSectionProps,
  releaseHealthSectionProps,
  runtimePanelProps,
  styleFusionMetricsSectionProps,
  topSegmentsProps,
}: {
  activePanel: AdminUxPanel;
  debugDiagnosticsSectionProps: ComponentProps<typeof DebugDiagnosticsSection>;
  engagementHealthProps: Omit<
    ComponentProps<typeof EngagementHealthSection>,
    'isVisible'
  >;
  engagementOverviewProps: Omit<
    ComponentProps<typeof EngagementOverviewSection>,
    'isVisible'
  >;
  feedInteractionCountersProps: Omit<
    ComponentProps<typeof FeedInteractionCountersSection>,
    'isVisible'
  >;
  feedPreferenceKpisProps: Omit<
    ComponentProps<typeof FeedPreferenceKpisSection>,
    'isVisible'
  >;
  gatewayPanelsProps: Omit<ComponentProps<typeof GatewayPanels>, 'isVisible'>;
  multimodalTelemetrySectionProps: ComponentProps<
    typeof MultimodalTelemetrySection
  >;
  predictionMarketSectionProps: ComponentProps<typeof PredictionMarketSection>;
  releaseHealthSectionProps: ComponentProps<typeof ReleaseHealthSection>;
  runtimePanelProps: Omit<ComponentProps<typeof RuntimePanel>, 'isVisible'>;
  styleFusionMetricsSectionProps: ComponentProps<
    typeof StyleFusionMetricsSection
  >;
  topSegmentsProps: Omit<
    ComponentProps<typeof TopSegmentsSection>,
    'isVisible'
  >;
}) => {
  const isPanelVisible = (panel: Exclude<AdminUxPanel, 'all'>) =>
    activePanel === 'all' || activePanel === panel;

  return (
    <>
      <GatewayPanels
        {...gatewayPanelsProps}
        isVisible={isPanelVisible('gateway')}
      />
      <RuntimePanel
        {...runtimePanelProps}
        isVisible={isPanelVisible('runtime')}
      />

      <EngagementOverviewSection
        {...engagementOverviewProps}
        isVisible={isPanelVisible('engagement')}
      />
      <EngagementHealthSection
        {...engagementHealthProps}
        isVisible={isPanelVisible('engagement')}
      />
      {isPanelVisible('release') ? (
        <ReleaseHealthSection {...releaseHealthSectionProps} />
      ) : null}
      <FeedPreferenceKpisSection
        {...feedPreferenceKpisProps}
        isVisible={isPanelVisible('engagement')}
      />
      {isPanelVisible('style') ? (
        <MultimodalTelemetrySection {...multimodalTelemetrySectionProps} />
      ) : null}
      {isPanelVisible('prediction') ? (
        <PredictionMarketSection {...predictionMarketSectionProps} />
      ) : null}
      {isPanelVisible('style') ? (
        <StyleFusionMetricsSection {...styleFusionMetricsSectionProps} />
      ) : null}
      {activePanel === 'debug' ? (
        <DebugDiagnosticsSection {...debugDiagnosticsSectionProps} />
      ) : null}
      <FeedInteractionCountersSection
        {...feedInteractionCountersProps}
        isVisible={isPanelVisible('engagement')}
      />
      <TopSegmentsSection
        {...topSegmentsProps}
        isVisible={isPanelVisible('engagement')}
      />
    </>
  );
};
