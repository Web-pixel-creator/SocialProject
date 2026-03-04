type HealthLevel = 'critical' | 'healthy' | 'unknown' | 'watch';

interface EngagementKpisInput {
  digestOpenRate?: number | null;
  followRate?: number | null;
  predictionNonDefaultSortRate?: number | null;
  predictionSortSwitchShare?: number | null;
  return24h?: number | null;
  viewModeObserverRate?: number | null;
}

interface HealthThresholds {
  criticalBelow: number;
  watchBelow: number;
}

interface PanelTabInput<T extends string> {
  id: T;
  label: string;
}

interface SegmentInput {
  count?: number | null;
  draftStatus?: string;
  eventType?: string;
  mode?: string;
}

export const buildTopSegmentsView = ({
  segments,
  toNumber,
}: {
  segments: SegmentInput[];
  toNumber: (value: unknown, fallback?: number) => number;
}): Array<{
  count: number;
  draftStatus: string;
  eventType: string;
  key: string;
  mode: string;
}> => {
  const topSegments = [...segments]
    .sort((left, right) => toNumber(right.count) - toNumber(left.count))
    .slice(0, 8);
  return topSegments.map((segment, index) => ({
    count: toNumber(segment.count),
    draftStatus: segment.draftStatus ?? 'unknown',
    eventType: segment.eventType ?? 'unknown',
    key: `${segment.mode ?? 'unknown'}:${segment.eventType ?? 'event'}:${index + 1}`,
    mode: segment.mode ?? 'unknown',
  }));
};

export const buildEngagementHealthSignals = ({
  healthBadgeClass,
  healthLabel,
  kpis,
  resolveHealthLevel,
  toRateText,
}: {
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  kpis: EngagementKpisInput;
  resolveHealthLevel: (
    value: unknown,
    thresholds: HealthThresholds,
  ) => HealthLevel;
  toRateText: (value: unknown) => string;
}): Array<{
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
  note: string;
  valueText: string;
}> => {
  const healthSignals = [
    {
      id: 'return24h',
      label: '24h retention',
      note: 'observer returns within 24 hours',
      value: kpis.return24h,
      thresholds: {
        criticalBelow: 0.1,
        watchBelow: 0.2,
      },
    },
    {
      id: 'followRate',
      label: 'Follow rate',
      note: 'watchlist follow events per viewed draft arc',
      value: kpis.followRate,
      thresholds: {
        criticalBelow: 0.15,
        watchBelow: 0.3,
      },
    },
    {
      id: 'digestOpenRate',
      label: 'Digest open rate',
      note: 'digest_open per watchlist_follow',
      value: kpis.digestOpenRate,
      thresholds: {
        criticalBelow: 0.2,
        watchBelow: 0.35,
      },
    },
    {
      id: 'observerModeShare',
      label: 'Observer mode share',
      note: 'share of view-mode switches into Observer',
      value: kpis.viewModeObserverRate,
      thresholds: {
        criticalBelow: 0.25,
        watchBelow: 0.4,
      },
    },
    {
      id: 'predictionSortSwitchShare',
      label: 'Prediction sort share',
      note: 'sort switches among prediction-history controls',
      value: kpis.predictionSortSwitchShare,
      thresholds: {
        criticalBelow: 0.25,
        watchBelow: 0.4,
      },
    },
    {
      id: 'predictionNonDefaultSortRate',
      label: 'Non-default sort share',
      note: 'share of sort switches away from recency',
      value: kpis.predictionNonDefaultSortRate,
      thresholds: {
        criticalBelow: 0.15,
        watchBelow: 0.3,
      },
    },
  ].map((signal) => ({
    ...signal,
    level: resolveHealthLevel(signal.value, signal.thresholds),
  }));

  return healthSignals
    .filter((signal) => signal.level !== 'unknown')
    .map((signal) => ({
      badgeClassName: healthBadgeClass(signal.level),
      badgeLabel: healthLabel(signal.level),
      id: signal.id,
      label: signal.label,
      note: signal.note,
      valueText: toRateText(signal.value),
    }));
};

export const buildPanelTabsView = <T extends string>({
  activePanel,
  buildPanelHref,
  panelTabs,
}: {
  activePanel: T;
  buildPanelHref: (panel: T) => string;
  panelTabs: PanelTabInput<T>[];
}): Array<{
  active: boolean;
  href: string;
  id: T;
  label: string;
}> =>
  panelTabs.map((tab) => ({
    active: activePanel === tab.id,
    href: buildPanelHref(tab.id),
    id: tab.id,
    label: tab.label,
  }));

export const buildStickyKpisView = ({
  healthBadgeClass,
  healthLabel,
  kpis,
  resolveHealthLevel,
  toRateText,
}: {
  healthBadgeClass: (level: HealthLevel) => string;
  healthLabel: (level: HealthLevel) => string;
  kpis: EngagementKpisInput & {
    predictionAccuracyRate?: number | null;
  };
  resolveHealthLevel: (
    value: unknown,
    thresholds: HealthThresholds,
  ) => HealthLevel;
  toRateText: (value: unknown) => string;
}): Array<{
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
  value: string;
}> => {
  const stickyKpis = [
    {
      id: 'kpi-return24h',
      label: '24h retention',
      value: toRateText(kpis.return24h),
      level: resolveHealthLevel(kpis.return24h, {
        criticalBelow: 0.1,
        watchBelow: 0.2,
      }),
    },
    {
      id: 'kpi-follow-rate',
      label: 'Follow rate',
      value: toRateText(kpis.followRate),
      level: resolveHealthLevel(kpis.followRate, {
        criticalBelow: 0.15,
        watchBelow: 0.3,
      }),
    },
    {
      id: 'kpi-digest-open-rate',
      label: 'Digest open',
      value: toRateText(kpis.digestOpenRate),
      level: resolveHealthLevel(kpis.digestOpenRate, {
        criticalBelow: 0.2,
        watchBelow: 0.35,
      }),
    },
    {
      id: 'kpi-prediction-accuracy',
      label: 'Prediction accuracy',
      value: toRateText(kpis.predictionAccuracyRate),
      level: resolveHealthLevel(kpis.predictionAccuracyRate, {
        criticalBelow: 0.45,
        watchBelow: 0.6,
      }),
    },
  ];

  return stickyKpis.map((kpi) => ({
    badgeClassName: healthBadgeClass(kpi.level),
    badgeLabel: healthLabel(kpi.level),
    id: kpi.id,
    label: kpi.label,
    value: kpi.value,
  }));
};
