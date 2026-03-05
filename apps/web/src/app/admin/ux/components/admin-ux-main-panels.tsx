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

type MetaTone = 'critical' | 'healthy' | 'neutral' | 'watch';

const metaToneClassName: Record<MetaTone, string> = {
  critical:
    'border-destructive/45 bg-destructive/10 text-destructive-foreground',
  healthy: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
  neutral: 'border-primary/30 bg-primary/10 text-primary',
  watch: 'border-amber-500/40 bg-amber-500/12 text-amber-200',
};

const metaToneMarker: Record<MetaTone, string> = {
  critical: '[!]',
  healthy: '[+]',
  neutral: '[i]',
  watch: '[~]',
};

const metaToneText: Record<MetaTone, string> = {
  critical: 'critical',
  healthy: 'healthy',
  neutral: 'info',
  watch: 'watch',
};

const CollapsiblePanelGroup = ({
  children,
  defaultOpen = false,
  description,
  metaLabel,
  metaTone = 'neutral',
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  metaLabel?: string;
  metaTone?: MetaTone;
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
          <span
            className={`${metaToneClassName[metaTone]} rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
          >
            <span className="sr-only">{metaToneText[metaTone]} status:</span>
            <span aria-hidden="true" className="mr-1">
              {metaToneMarker[metaTone]}
            </span>
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

const resolveMetaToneFromRiskLabel = (label: string): MetaTone => {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('critical')) {
    return 'critical';
  }
  if (normalized.includes('watch')) {
    return 'watch';
  }
  if (normalized.includes('healthy')) {
    return 'healthy';
  }
  return 'neutral';
};

const resolveMoreSevereMetaTone = (
  left: MetaTone,
  right: MetaTone,
): MetaTone => {
  const rank: Record<MetaTone, number> = {
    neutral: 0,
    healthy: 1,
    watch: 2,
    critical: 3,
  };
  return rank[left] >= rank[right] ? left : right;
};

export const AdminUxMainPanels = ({
  activePanel,
  debugDiagnosticsSectionProps,
  engagementHealthProps,
  engagementOverviewProps,
  expandAllGroups = false,
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
  expandAllGroups?: boolean;
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
    metaTone,
    description,
    title,
  }: {
    children: ReactNode;
    description: string;
    metaLabel?: string;
    metaTone?: MetaTone;
    title: string;
  }) => {
    if (!isAllMetricsPanel) {
      return children;
    }
    return (
      <CollapsiblePanelGroup
        defaultOpen={expandAllGroups}
        description={description}
        metaLabel={metaLabel}
        metaTone={metaTone}
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
  const styleMetaTone = resolveMoreSevereMetaTone(
    resolveMetaToneFromRiskLabel(
      styleFusionMetricsSectionProps.fusionRiskLabel,
    ),
    resolveMetaToneFromRiskLabel(styleFusionMetricsSectionProps.copyRiskLabel),
  );
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
            metaTone: resolveMetaToneFromRiskLabel(
              releaseHealthSectionProps.releaseRiskLabel,
            ),
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
            metaTone: feedPreferenceKpisProps.shouldCompact
              ? 'watch'
              : 'healthy',
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
            metaTone: resolveMetaToneFromRiskLabel(
              multimodalTelemetrySectionProps.coverageRiskLabel,
            ),
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
            metaTone: resolveMetaToneFromRiskLabel(
              predictionMarketSectionProps.accuracyLabel,
            ),
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
            metaTone: styleMetaTone,
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
            metaTone: feedInteractionTotalCount > 0 ? 'healthy' : 'watch',
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
            metaTone: topSegmentsCount > 0 ? 'healthy' : 'watch',
            title: 'Top segments',
            children: <TopSegmentsSection {...topSegmentsProps} isVisible />,
          })
        : null}
    </>
  );
};
