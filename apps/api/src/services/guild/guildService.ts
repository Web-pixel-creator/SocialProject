import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import type {
  Guild,
  GuildAgent,
  GuildDetail,
  GuildDraft,
  GuildFilters,
  GuildService,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

interface GuildRow {
  id: string;
  name: string;
  description: string | null;
  theme_of_week: string | null;
  created_at: Date;
  agent_count?: number | string | null;
}

interface GuildAgentRow {
  id: string;
  studio_name: string;
  impact: number | string | null;
  signal: number | string | null;
}

interface GuildDraftRow {
  id: string;
  glow_up_score: number | string | null;
  updated_at: Date;
  status: GuildDraft['status'];
}

const mapGuild = (row: GuildRow): Guild => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
  themeOfWeek: row.theme_of_week ?? null,
  createdAt: row.created_at,
  agentCount: row.agent_count != null ? Number(row.agent_count) : undefined,
});

const mapAgent = (row: GuildAgentRow): GuildAgent => ({
  id: row.id,
  studioName: row.studio_name,
  impact: Number(row.impact ?? 0),
  signal: Number(row.signal ?? 0),
});

const mapDraft = (row: GuildDraftRow): GuildDraft => ({
  id: row.id,
  glowUpScore: Number(row.glow_up_score ?? 0),
  updatedAt: row.updated_at,
  status: row.status,
});

export class GuildServiceImpl implements GuildService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async listGuilds(
    filters: GuildFilters = {},
    client?: DbClient,
  ): Promise<Guild[]> {
    const db = getDb(this.pool, client);
    const { limit = 20, offset = 0 } = filters;

    const result = await db.query(
      `SELECT g.*, COUNT(a.id) AS agent_count
       FROM guilds g
       LEFT JOIN agents a ON a.guild_id = g.id
       GROUP BY g.id
       ORDER BY g.name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return result.rows.map((row) => mapGuild(row as GuildRow));
  }

  async getGuildDetail(
    id: string,
    client?: DbClient,
  ): Promise<GuildDetail | null> {
    const db = getDb(this.pool, client);
    const guildRes = await db.query('SELECT * FROM guilds WHERE id = $1', [id]);
    if (guildRes.rows.length === 0) {
      return null;
    }

    const guild = mapGuild(guildRes.rows[0] as GuildRow);

    const agentsRes = await db.query(
      `SELECT id, studio_name, impact, signal
       FROM agents
       WHERE guild_id = $1
       ORDER BY impact DESC, signal DESC
       LIMIT 3`,
      [id],
    );

    const draftsRes = await db.query(
      `SELECT d.id, d.glow_up_score, d.updated_at, d.status
       FROM drafts d
       JOIN agents a ON a.id = d.author_id
       WHERE a.guild_id = $1
       ORDER BY d.glow_up_score DESC, d.updated_at DESC
       LIMIT 3`,
      [id],
    );

    return {
      guild,
      topAgents: agentsRes.rows.map((row) => mapAgent(row as GuildAgentRow)),
      topDrafts: draftsRes.rows.map((row) => mapDraft(row as GuildDraftRow)),
    };
  }
}
