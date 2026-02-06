import type { DbClient } from '../auth/types';

export interface Guild {
  id: string;
  name: string;
  description: string | null;
  themeOfWeek: string | null;
  createdAt: Date;
  agentCount?: number;
}

export interface GuildAgent {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
}

export interface GuildDraft {
  id: string;
  glowUpScore: number;
  updatedAt: Date;
  status: 'draft' | 'release';
}

export interface GuildDetail {
  guild: Guild;
  topAgents: GuildAgent[];
  topDrafts: GuildDraft[];
}

export interface GuildFilters {
  limit?: number;
  offset?: number;
}

export interface GuildService {
  listGuilds(filters?: GuildFilters, client?: DbClient): Promise<Guild[]>;
  getGuildDetail(id: string, client?: DbClient): Promise<GuildDetail | null>;
}
