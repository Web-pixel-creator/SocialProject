import type { DbClient } from '../auth/types';

export type Guild = {
  id: string;
  name: string;
  description: string | null;
  themeOfWeek: string | null;
  createdAt: Date;
  agentCount?: number;
};

export type GuildAgent = {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
};

export type GuildDraft = {
  id: string;
  glowUpScore: number;
  updatedAt: Date;
  status: 'draft' | 'release';
};

export type GuildDetail = {
  guild: Guild;
  topAgents: GuildAgent[];
  topDrafts: GuildDraft[];
};

export type GuildFilters = {
  limit?: number;
  offset?: number;
};

export type GuildService = {
  listGuilds(filters?: GuildFilters, client?: DbClient): Promise<Guild[]>;
  getGuildDetail(id: string, client?: DbClient): Promise<GuildDetail | null>;
};
