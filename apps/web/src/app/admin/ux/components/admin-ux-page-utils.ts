import type { AgentGatewayRecentEvent } from './admin-ux-data-client';

export const ADMIN_UX_PANELS = [
  'all',
  'gateway',
  'runtime',
  'engagement',
  'prediction',
  'release',
  'style',
  'debug',
] as const;

export type AdminUxPanel = (typeof ADMIN_UX_PANELS)[number];

export const ADMIN_UX_ALL_METRICS_VIEWS = [
  'overview',
  'operations',
  'engagement',
  'quality',
  'debug',
] as const;

export type AdminUxAllMetricsView = (typeof ADMIN_UX_ALL_METRICS_VIEWS)[number];

export const ADMIN_UX_ALL_METRICS_RISK_FILTERS = ['all', 'high'] as const;

export type AdminUxAllMetricsRiskFilter =
  (typeof ADMIN_UX_ALL_METRICS_RISK_FILTERS)[number];

export const ADMIN_UX_ALL_METRICS_RISK_TONES = [
  'all',
  'critical',
  'watch',
  'healthy',
  'neutral',
] as const;

export type AdminUxAllMetricsRiskTone =
  (typeof ADMIN_UX_ALL_METRICS_RISK_TONES)[number];

const ADMIN_UX_PANEL_VALUES = new Set<string>(ADMIN_UX_PANELS);
const ADMIN_UX_ALL_METRICS_VIEW_VALUES = new Set<string>(
  ADMIN_UX_ALL_METRICS_VIEWS,
);
const ADMIN_UX_ALL_METRICS_RISK_FILTER_VALUES = new Set<string>(
  ADMIN_UX_ALL_METRICS_RISK_FILTERS,
);
const ADMIN_UX_ALL_METRICS_RISK_TONE_VALUES = new Set<string>(
  ADMIN_UX_ALL_METRICS_RISK_TONES,
);
const PREDICTION_OUTCOME_LABEL_SEGMENT_PATTERN = /[_\s-]+/;

export const resolveAdminUxPanel = (value: unknown): AdminUxPanel => {
  if (typeof value !== 'string') {
    return 'gateway';
  }
  const normalized = value.trim().toLowerCase();
  if (!ADMIN_UX_PANEL_VALUES.has(normalized)) {
    return 'gateway';
  }
  return normalized as AdminUxPanel;
};

export const resolveAdminUxAllMetricsView = (
  value: unknown,
): AdminUxAllMetricsView => {
  if (typeof value !== 'string') {
    return 'overview';
  }
  const normalized = value.trim().toLowerCase();
  if (!ADMIN_UX_ALL_METRICS_VIEW_VALUES.has(normalized)) {
    return 'overview';
  }
  return normalized as AdminUxAllMetricsView;
};

export const resolveAdminUxAllMetricsRiskFilter = (
  value: unknown,
): AdminUxAllMetricsRiskFilter => {
  if (typeof value !== 'string') {
    return 'all';
  }
  const normalized = value.trim().toLowerCase();
  if (!ADMIN_UX_ALL_METRICS_RISK_FILTER_VALUES.has(normalized)) {
    return 'all';
  }
  return normalized as AdminUxAllMetricsRiskFilter;
};

export const resolveAdminUxAllMetricsRiskTone = (
  value: unknown,
): AdminUxAllMetricsRiskTone => {
  if (typeof value !== 'string') {
    return 'all';
  }
  const normalized = value.trim().toLowerCase();
  if (!ADMIN_UX_ALL_METRICS_RISK_TONE_VALUES.has(normalized)) {
    return 'all';
  }
  return normalized as AdminUxAllMetricsRiskTone;
};

export const formatPredictionOutcomeMetricLabel = (value: string): string => {
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

const toCsvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const buildEventsCsv = (events: AgentGatewayRecentEvent[]): string => {
  const header = ['id', 'type', 'fromRole', 'toRole', 'createdAt'].join(',');
  const rows = events.map((event) =>
    [
      toCsvCell(event.id),
      toCsvCell(event.type),
      toCsvCell(event.fromRole),
      toCsvCell(event.toRole),
      toCsvCell(event.createdAt),
    ].join(','),
  );
  return [header, ...rows].join('\n');
};
