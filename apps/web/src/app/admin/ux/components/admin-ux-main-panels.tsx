import { type ComponentProps, Fragment, type ReactNode } from 'react';

import type {
  AdminUxAllMetricsRiskFilter,
  AdminUxAllMetricsRiskTone,
  AdminUxAllMetricsSignalFilter,
  AdminUxAllMetricsView,
  AdminUxPanel,
} from './admin-ux-page-utils';
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
import { VerificationSection } from './verification-section';

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

const metaToneSortRank: Record<MetaTone, number> = {
  critical: 0,
  watch: 1,
  healthy: 2,
  neutral: 3,
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

const resolveRiskToneLabel = (tone: AdminUxAllMetricsRiskTone): string => {
  if (tone === 'all') {
    return 'all tones';
  }
  if (tone === 'neutral') {
    return 'info tone';
  }
  return `${tone} tone`;
};

const resolveSeverityScopeLabel = (
  riskFilter: AdminUxAllMetricsRiskFilter,
): string => {
  if (riskFilter === 'high') {
    return 'high-risk only';
  }
  return 'all severities';
};

const resolveSignalScopeLabel = (
  signalFilter: AdminUxAllMetricsSignalFilter,
): string => {
  if (signalFilter === 'active') {
    return 'signal-only sections';
  }
  return 'all sections';
};

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
  allMetricsRiskFilter = 'all',
  allMetricsSignalFilter = 'all',
  allMetricsRiskTone = 'all',
  allMetricsView = 'overview',
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
  verificationSectionProps,
}: {
  activePanel: AdminUxPanel;
  allMetricsRiskFilter?: AdminUxAllMetricsRiskFilter;
  allMetricsSignalFilter?: AdminUxAllMetricsSignalFilter;
  allMetricsRiskTone?: AdminUxAllMetricsRiskTone;
  allMetricsView?: AdminUxAllMetricsView;
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
  verificationSectionProps: ComponentProps<typeof VerificationSection>;
}) => {
  const isPanelVisible = (panel: Exclude<AdminUxPanel, 'all'>) =>
    activePanel === 'all' || activePanel === panel;
  const isAllMetricsSubviewVisible = (...views: AdminUxAllMetricsView[]) =>
    allMetricsView === 'overview' || views.includes(allMetricsView);
  const isAllMetricsPanel = activePanel === 'all';
  const isGatewayVisible =
    activePanel === 'all'
      ? isAllMetricsSubviewVisible('operations', 'gateway')
      : isPanelVisible('gateway');
  const isRuntimeVisible =
    activePanel === 'all'
      ? isAllMetricsSubviewVisible('operations', 'runtime')
      : isPanelVisible('runtime');
  const isEngagementVisible =
    activePanel === 'all'
      ? isAllMetricsSubviewVisible('engagement')
      : isPanelVisible('engagement');
  const isReleaseVisible =
    activePanel === 'all'
      ? isAllMetricsSubviewVisible('quality')
      : isPanelVisible('release');
  const isPredictionVisible =
    activePanel === 'all'
      ? isAllMetricsSubviewVisible('quality')
      : isPanelVisible('prediction');
  const isStyleVisible =
    activePanel === 'all'
      ? isAllMetricsSubviewVisible('quality')
      : isPanelVisible('style');
  const isDebugVisible =
    activePanel === 'all'
      ? isAllMetricsSubviewVisible('debug')
      : activePanel === 'debug';
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
  const verificationVisibleStatCount = [
    verificationSectionProps.avgHoursToVerifyText,
    verificationSectionProps.blockedActionCount,
    verificationSectionProps.blockedActionRateText,
    verificationSectionProps.claimCreatedCount,
    verificationSectionProps.claimFailedCount,
    verificationSectionProps.claimVerifiedCount,
    verificationSectionProps.failureRateText,
    verificationSectionProps.pendingClaimsCount,
    verificationSectionProps.revokedAgentsCount,
    verificationSectionProps.revokedClaimsCount,
    verificationSectionProps.totalAgentsCount,
    verificationSectionProps.totalClaimsCount,
    verificationSectionProps.unverifiedAgentsCount,
    verificationSectionProps.verificationRateText,
    verificationSectionProps.verifiedAgentsCount,
  ].filter((value) => !isNaLikeValue(value)).length;
  const verificationSignalCount =
    verificationVisibleStatCount +
    verificationSectionProps.methodRows.length +
    verificationSectionProps.failureReasons.length;
  const gatewaySessionCount =
    gatewayPanelsProps.liveBodyProps.gatewaySessions.length;
  const gatewayRetainedEventsCount = (
    gatewayPanelsProps.liveBodyProps.gatewayRecentEvents ?? []
  ).length;
  const gatewaySignalCount = gatewaySessionCount + gatewayRetainedEventsCount;
  const runtimeRoleCount =
    runtimePanelProps.bodyProps.aiRuntimeSummary.roleCount;
  const runtimeProviderCount =
    runtimePanelProps.bodyProps.aiRuntimeSummary.providerCount;
  const runtimeBlockedCount =
    runtimePanelProps.bodyProps.aiRuntimeSummary.rolesBlocked;
  const engagementSignalCount = engagementHealthProps.signals.length;
  const engagementLowSignal = engagementOverviewProps.shouldCompact;
  let engagementMetaTone: MetaTone = 'neutral';
  if (engagementLowSignal) {
    engagementMetaTone = 'watch';
  } else if (engagementSignalCount > 0) {
    engagementMetaTone = 'healthy';
  }
  const gatewayMetaTone = resolveMetaToneFromRiskLabel(
    gatewayPanelsProps.gatewayHealthLabel,
  );
  const runtimeMetaTone: MetaTone =
    runtimeBlockedCount > 0
      ? 'critical'
      : resolveMetaToneFromRiskLabel(runtimePanelProps.runtimeHealthLabel);
  const releaseMetaTone = resolveMetaToneFromRiskLabel(
    releaseHealthSectionProps.releaseRiskLabel,
  );
  const multimodalMetaTone = resolveMetaToneFromRiskLabel(
    multimodalTelemetrySectionProps.coverageRiskLabel,
  );
  const predictionMetaTone = resolveMetaToneFromRiskLabel(
    predictionMarketSectionProps.accuracyLabel,
  );
  const feedPreferenceMetaTone: MetaTone = feedPreferenceKpisProps.shouldCompact
    ? 'watch'
    : 'healthy';
  const feedInteractionMetaTone: MetaTone =
    feedInteractionTotalCount > 0 ? 'healthy' : 'watch';
  const topSegmentsMetaTone: MetaTone =
    topSegmentsCount > 0 ? 'healthy' : 'watch';
  const verificationMetaTone = resolveMetaToneFromRiskLabel(
    verificationSectionProps.verificationRiskLabel,
  );

  if (isAllMetricsPanel) {
    const allMetricsGroups: Array<{
      key: string;
      node: ReactNode;
      order: number;
      signalCount: number;
      tone: MetaTone;
    }> = [];

    if (isGatewayVisible) {
      allMetricsGroups.push({
        key: 'gateway-operations',
        node: renderAllMetricsGroup({
          description:
            'Live session control plane, retained events, and gateway risk telemetry.',
          metaLabel: toSignalLabel(gatewaySignalCount),
          metaTone: gatewayMetaTone,
          title: 'Gateway operations',
          children: <GatewayPanels {...gatewayPanelsProps} isVisible />,
        }),
        order: 10,
        signalCount: gatewaySignalCount,
        tone: gatewayMetaTone,
      });
    }

    if (isRuntimeVisible) {
      allMetricsGroups.push({
        key: 'runtime-orchestration',
        node: renderAllMetricsGroup({
          description:
            'Failover chain health, role/provider matrix, and dry-run simulator.',
          metaLabel: `${runtimeRoleCount} roles / ${runtimeProviderCount} providers`,
          metaTone: runtimeMetaTone,
          title: 'Runtime orchestration',
          children: <RuntimePanel {...runtimePanelProps} isVisible />,
        }),
        order: 20,
        signalCount: runtimeRoleCount + runtimeProviderCount,
        tone: runtimeMetaTone,
      });
    }

    if (isEngagementVisible) {
      allMetricsGroups.push({
        key: 'engagement-signals',
        node: renderAllMetricsGroup({
          description:
            'Session quality, retention/follow signals, and alert scoring.',
          metaLabel: engagementLowSignal
            ? 'low signal'
            : toSignalLabel(engagementSignalCount),
          metaTone: engagementMetaTone,
          title: 'Engagement signals',
          children: (
            <>
              <EngagementOverviewSection
                {...engagementOverviewProps}
                isVisible
              />
              <EngagementHealthSection {...engagementHealthProps} isVisible />
            </>
          ),
        }),
        order: 30,
        signalCount: engagementLowSignal ? 0 : engagementSignalCount,
        tone: engagementMetaTone,
      });
      allMetricsGroups.push({
        key: 'verification-funnel',
        node: renderAllMetricsGroup({
          description:
            'Claim completion, guardrail pressure, and failure-reason mix.',
          metaLabel: toSignalLabel(verificationSignalCount),
          metaTone: verificationMetaTone,
          title: 'Verification funnel',
          children: <VerificationSection {...verificationSectionProps} />,
        }),
        order: 35,
        signalCount: verificationSignalCount,
        tone: verificationMetaTone,
      });
    }

    if (isReleaseVisible) {
      allMetricsGroups.push({
        key: 'release-telemetry',
        node: renderAllMetricsGroup({
          description:
            'Release alert distribution, latest run context, and failure-mode flow.',
          metaLabel: toSignalLabel(releaseSignalCount),
          metaTone: releaseMetaTone,
          title: 'Release health telemetry',
          children: <ReleaseHealthSection {...releaseHealthSectionProps} />,
        }),
        order: 40,
        signalCount: releaseSignalCount,
        tone: releaseMetaTone,
      });
    }

    if (isStyleVisible) {
      allMetricsGroups.push({
        key: 'multimodal-summary',
        node: renderAllMetricsGroup({
          description:
            'Coverage/error rates, provider mix, and multimodal guardrails.',
          metaLabel: toSignalLabel(multimodalSignalCount),
          metaTone: multimodalMetaTone,
          title: 'Multimodal summary',
          children: (
            <MultimodalTelemetrySection {...multimodalTelemetrySectionProps} />
          ),
        }),
        order: 50,
        signalCount: multimodalSignalCount,
        tone: multimodalMetaTone,
      });
    }

    if (isPredictionVisible) {
      allMetricsGroups.push({
        key: 'prediction-summary',
        node: renderAllMetricsGroup({
          description:
            'Prediction quality, cohort risk, and filter/sort behavior.',
          metaLabel: toSignalLabel(predictionSignalCount),
          metaTone: predictionMetaTone,
          title: 'Prediction telemetry summary',
          children: (
            <PredictionMarketSection {...predictionMarketSectionProps} />
          ),
        }),
        order: 60,
        signalCount: predictionSignalCount,
        tone: predictionMetaTone,
      });
    }

    if (isStyleVisible) {
      allMetricsGroups.push({
        key: 'style-fusion-summary',
        node: renderAllMetricsGroup({
          description: 'Style-fusion and copy-action success/error rates.',
          metaLabel: `${styleSignalCount} events`,
          metaTone: styleMetaTone,
          title: 'Style fusion summary',
          children: (
            <StyleFusionMetricsSection {...styleFusionMetricsSectionProps} />
          ),
        }),
        order: 70,
        signalCount: styleSignalCount,
        tone: styleMetaTone,
      });
    }

    if (isEngagementVisible) {
      allMetricsGroups.push({
        key: 'feed-preference-summary',
        node: renderAllMetricsGroup({
          description: 'Mode, density, and hint behavior KPIs.',
          metaLabel: feedPreferenceKpisProps.shouldCompact
            ? 'low signal'
            : '5 kpis',
          metaTone: feedPreferenceMetaTone,
          title: 'Feed preference summary',
          children: (
            <FeedPreferenceKpisSection {...feedPreferenceKpisProps} isVisible />
          ),
        }),
        order: 80,
        signalCount: feedPreferenceKpisProps.shouldCompact ? 0 : 5,
        tone: feedPreferenceMetaTone,
      });
      allMetricsGroups.push({
        key: 'feed-interaction-counters',
        node: renderAllMetricsGroup({
          description: 'Raw event totals for mode/density/hint actions.',
          metaLabel: `${feedInteractionTotalCount} events`,
          metaTone: feedInteractionMetaTone,
          title: 'Feed interaction counters',
          children: (
            <FeedInteractionCountersSection
              {...feedInteractionCountersProps}
              isVisible
            />
          ),
        }),
        order: 90,
        signalCount: feedInteractionTotalCount,
        tone: feedInteractionMetaTone,
      });
      allMetricsGroups.push({
        key: 'top-segments',
        node: renderAllMetricsGroup({
          description:
            'Highest-volume observer segments in the selected window.',
          metaLabel: `${topSegmentsCount} segments`,
          metaTone: topSegmentsMetaTone,
          title: 'Top segments',
          children: <TopSegmentsSection {...topSegmentsProps} isVisible />,
        }),
        order: 100,
        signalCount: topSegmentsCount,
        tone: topSegmentsMetaTone,
      });
    }

    if (isDebugVisible) {
      allMetricsGroups.push({
        key: 'debug-diagnostics',
        node: <DebugDiagnosticsSection {...debugDiagnosticsSectionProps} />,
        order: 110,
        signalCount: 0,
        tone: 'neutral',
      });
    }

    const toneScopedGroups =
      allMetricsRiskTone === 'all'
        ? allMetricsGroups
        : allMetricsGroups.filter((group) => group.tone === allMetricsRiskTone);

    const riskScopedGroups =
      allMetricsRiskFilter === 'high'
        ? toneScopedGroups.filter(
            (group) => group.tone === 'critical' || group.tone === 'watch',
          )
        : toneScopedGroups;
    const signalScopedGroups =
      allMetricsSignalFilter === 'active'
        ? riskScopedGroups.filter((group) => group.signalCount > 0)
        : riskScopedGroups;

    if (signalScopedGroups.length === 0) {
      const severityScopeLabel =
        resolveSeverityScopeLabel(allMetricsRiskFilter);
      const toneScopeLabel = resolveRiskToneLabel(allMetricsRiskTone);
      const signalScopeLabel = resolveSignalScopeLabel(allMetricsSignalFilter);
      return (
        <section className="card p-4 sm:p-5">
          <p className="text-muted-foreground text-sm">
            No sections match current filters: {severityScopeLabel},{' '}
            {toneScopeLabel}, {signalScopeLabel}.
          </p>
        </section>
      );
    }

    return (
      <>
        {signalScopedGroups
          .sort((left, right) => {
            const toneDiff =
              metaToneSortRank[left.tone] - metaToneSortRank[right.tone];
            if (toneDiff !== 0) {
              return toneDiff;
            }
            return left.order - right.order;
          })
          .map((group) => (
            <Fragment key={group.key}>{group.node}</Fragment>
          ))}
      </>
    );
  }

  return (
    <>
      {activePanel === 'gateway' ? (
        <GatewayPanels {...gatewayPanelsProps} isVisible />
      ) : null}
      {activePanel === 'runtime' ? (
        <RuntimePanel {...runtimePanelProps} isVisible />
      ) : null}
      {activePanel === 'engagement' ? (
        <>
          <EngagementOverviewSection {...engagementOverviewProps} isVisible />
          <EngagementHealthSection {...engagementHealthProps} isVisible />
          <VerificationSection {...verificationSectionProps} />
        </>
      ) : null}
      {activePanel === 'release' ? (
        <ReleaseHealthSection {...releaseHealthSectionProps} />
      ) : null}
      {activePanel === 'style' ? (
        <>
          <MultimodalTelemetrySection {...multimodalTelemetrySectionProps} />
          <StyleFusionMetricsSection {...styleFusionMetricsSectionProps} />
        </>
      ) : null}
      {activePanel === 'prediction' ? (
        <PredictionMarketSection {...predictionMarketSectionProps} />
      ) : null}
      {activePanel === 'debug' ? (
        <DebugDiagnosticsSection {...debugDiagnosticsSectionProps} />
      ) : null}
      {activePanel === 'engagement' ? (
        <FeedPreferenceKpisSection {...feedPreferenceKpisProps} isVisible />
      ) : null}
      {activePanel === 'engagement' ? (
        <FeedInteractionCountersSection
          {...feedInteractionCountersProps}
          isVisible
        />
      ) : null}
      {activePanel === 'engagement' ? (
        <TopSegmentsSection {...topSegmentsProps} isVisible />
      ) : null}
    </>
  );
};
