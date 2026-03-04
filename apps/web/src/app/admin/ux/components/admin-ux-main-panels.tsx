import type { ComponentProps, ReactNode } from 'react';

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

const CollapsiblePanelGroup = ({
  children,
  defaultOpen = false,
  description,
  metaLabel,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  metaLabel?: string;
  title: string;
}) => (
  <details className="card p-4 sm:p-5" open={defaultOpen}>
    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
      <div className="grid gap-1">
        <h3 className="font-semibold text-base text-foreground">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {metaLabel ? (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary text-xs uppercase tracking-wide">
            {metaLabel}
          </span>
        ) : null}
        <span className="rounded-full border border-border/45 bg-background/55 px-2 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          toggle
        </span>
      </div>
    </summary>
    <div className="mt-3 grid gap-3">{children}</div>
  </details>
);

const isNaLikeValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'n/a' || normalized === 'na';
};

const toSignalLabel = (count: number): string =>
  `${count} signal${count === 1 ? '' : 's'}`;

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
  const isAllMetricsPanel = activePanel === 'all';
  const isEngagementVisible = isPanelVisible('engagement');
  const renderAllMetricsGroup = ({
    children,
    metaLabel,
    description,
    title,
  }: {
    children: ReactNode;
    description: string;
    metaLabel?: string;
    title: string;
  }) => {
    if (!isAllMetricsPanel) {
      return children;
    }
    return (
      <CollapsiblePanelGroup
        description={description}
        metaLabel={metaLabel}
        title={title}
      >
        {children}
      </CollapsiblePanelGroup>
    );
  };
  const releaseVisibleCardCount = [
    releaseHealthSectionProps.releaseAlertsCount,
    releaseHealthSectionProps.releaseFirstAppearancesCount,
    releaseHealthSectionProps.releaseRunsCount,
    releaseHealthSectionProps.releaseLatestRunLabel,
  ].filter((value) => !isNaLikeValue(value)).length;
  const releaseSignalCount =
    releaseVisibleCardCount + releaseHealthSectionProps.breakdownRows.length;
  const multimodalVisibleTopCount =
    multimodalTelemetrySectionProps.multimodalStatCards.filter(
      (card) => !isNaLikeValue(card.value),
    ).length;
  const multimodalVisibleGuardrailCount = [
    multimodalTelemetrySectionProps.invalidQueryErrorsValue,
    multimodalTelemetrySectionProps.invalidQueryShareText,
  ].filter((value) => !isNaLikeValue(value)).length;
  const multimodalSignalCount =
    multimodalVisibleTopCount +
    multimodalVisibleGuardrailCount +
    multimodalTelemetrySectionProps.breakdownRows.length;
  const predictionVisibleTopCount =
    predictionMarketSectionProps.predictionStatCards.filter(
      (card) => !isNaLikeValue(card.value),
    ).length;
  const predictionVisibleShareCount = [
    predictionMarketSectionProps.filterSwitchShareText,
    predictionMarketSectionProps.sortSwitchShareText,
    predictionMarketSectionProps.nonDefaultSortShareText,
  ].filter((value) => !isNaLikeValue(value)).length;
  const predictionSignalCount =
    predictionVisibleTopCount +
    predictionVisibleShareCount +
    predictionMarketSectionProps.cohortsByOutcomeRows.length +
    predictionMarketSectionProps.cohortsByStakeBandRows.length +
    predictionMarketSectionProps.historyScopeRows.length +
    predictionMarketSectionProps.scopeFilterMatrixRows.length +
    predictionMarketSectionProps.scopeSortMatrixRows.length;
  const styleSignalCount =
    styleFusionMetricsSectionProps.metrics.total +
    styleFusionMetricsSectionProps.metrics.copy.total;
  const feedInteractionTotalCount =
    feedInteractionCountersProps.viewMode.total +
    feedInteractionCountersProps.density.total +
    feedInteractionCountersProps.hint.total;
  const topSegmentsCount = topSegmentsProps.topSegments.length;

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
        isVisible={isEngagementVisible}
      />
      <EngagementHealthSection
        {...engagementHealthProps}
        isVisible={isEngagementVisible}
      />
      {isPanelVisible('release')
        ? renderAllMetricsGroup({
            description:
              'Release alert distribution, latest run context, and failure-mode flow.',
            metaLabel: toSignalLabel(releaseSignalCount),
            title: 'Release health telemetry',
            children: <ReleaseHealthSection {...releaseHealthSectionProps} />,
          })
        : null}
      {isEngagementVisible
        ? renderAllMetricsGroup({
            description: 'Mode, density, and hint behavior KPIs.',
            metaLabel: feedPreferenceKpisProps.shouldCompact
              ? 'low signal'
              : '5 kpis',
            title: 'Feed preference summary',
            children: (
              <FeedPreferenceKpisSection
                {...feedPreferenceKpisProps}
                isVisible
              />
            ),
          })
        : null}
      {isPanelVisible('style')
        ? renderAllMetricsGroup({
            description:
              'Coverage/error rates, provider mix, and multimodal guardrails.',
            metaLabel: toSignalLabel(multimodalSignalCount),
            title: 'Multimodal summary',
            children: (
              <MultimodalTelemetrySection
                {...multimodalTelemetrySectionProps}
              />
            ),
          })
        : null}
      {isPanelVisible('prediction')
        ? renderAllMetricsGroup({
            description:
              'Prediction quality, cohort risk, and filter/sort behavior.',
            metaLabel: toSignalLabel(predictionSignalCount),
            title: 'Prediction telemetry summary',
            children: (
              <PredictionMarketSection {...predictionMarketSectionProps} />
            ),
          })
        : null}
      {isPanelVisible('style')
        ? renderAllMetricsGroup({
            description: 'Style-fusion and copy-action success/error rates.',
            metaLabel: `${styleSignalCount} events`,
            title: 'Style fusion summary',
            children: (
              <StyleFusionMetricsSection {...styleFusionMetricsSectionProps} />
            ),
          })
        : null}
      {activePanel === 'debug' ? (
        <DebugDiagnosticsSection {...debugDiagnosticsSectionProps} />
      ) : null}
      {isEngagementVisible
        ? renderAllMetricsGroup({
            description: 'Raw event totals for mode/density/hint actions.',
            metaLabel: `${feedInteractionTotalCount} events`,
            title: 'Feed interaction counters',
            children: (
              <FeedInteractionCountersSection
                {...feedInteractionCountersProps}
                isVisible
              />
            ),
          })
        : null}
      {isEngagementVisible
        ? renderAllMetricsGroup({
            description:
              'Highest-volume observer segments in the selected window.',
            metaLabel: `${topSegmentsCount} segments`,
            title: 'Top segments',
            children: <TopSegmentsSection {...topSegmentsProps} isVisible />,
          })
        : null}
    </>
  );
};
