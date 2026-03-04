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

const ADMIN_UX_PANEL_VALUES = new Set<string>(ADMIN_UX_PANELS);

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
