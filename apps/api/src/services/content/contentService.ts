import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  AutopsyPattern,
  AutopsyReport,
  ContentGenerationService,
  GlowUpReel,
  GlowUpReelItem,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const buildShareSlug = (prefix: string) =>
  `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;

const buildReelUrl = (shareSlug: string) =>
  `https://cdn.finishit.local/reels/${shareSlug}.mp4`;

const toIso = (value: any): string => new Date(value).toISOString();

export class ContentGenerationServiceImpl implements ContentGenerationService {
  constructor(private readonly pool: Pool) {}

  async generateGlowUpReel(limit = 5, client?: DbClient): Promise<GlowUpReel> {
    const db = getDb(this.pool, client);

    const drafts = await db.query(
      `SELECT id, author_id, glow_up_score
       FROM drafts
       WHERE updated_at >= NOW() - INTERVAL '24 hours'
       ORDER BY glow_up_score DESC
       LIMIT $1`,
      [limit],
    );

    if (drafts.rows.length === 0) {
      throw new ServiceError(
        'REEL_EMPTY',
        'No qualifying drafts for GlowUp reel.',
      );
    }

    const items: GlowUpReelItem[] = [];

    for (const row of drafts.rows) {
      const draftId = row.id as string;
      const versions = await db.query(
        'SELECT version_number, image_url FROM versions WHERE draft_id = $1 ORDER BY version_number ASC',
        [draftId],
      );

      if (versions.rows.length === 0) {
        continue;
      }

      const before = versions.rows[0];
      const after = versions.rows.at(-1);
      if (!after) {
        continue;
      }

      const author = await db.query(
        'SELECT id, studio_name FROM agents WHERE id = $1',
        [row.author_id],
      );
      const makers = await db.query(
        `SELECT a.id, a.studio_name, COUNT(*) as merged_count
         FROM pull_requests pr
         JOIN agents a ON a.id = pr.maker_id
         WHERE pr.draft_id = $1 AND pr.status = 'merged'
         GROUP BY a.id, a.studio_name
         ORDER BY merged_count DESC
         LIMIT 3`,
        [draftId],
      );

      const animationUrl = `https://cdn.finishit.local/animations/${draftId}-${before.version_number}-${after.version_number}.mp4`;

      items.push({
        draftId,
        glowUpScore: Number(row.glow_up_score ?? 0),
        beforeImageUrl: before.image_url,
        afterImageUrl: after.image_url,
        animationUrl,
        credits: {
          author: {
            id: author.rows[0]?.id ?? row.author_id,
            studioName: author.rows[0]?.studio_name ?? 'Unknown',
          },
          makers: makers.rows.map((maker: any) => ({
            id: maker.id,
            studioName: maker.studio_name,
          })),
        },
      });
    }

    if (items.length === 0) {
      throw new ServiceError(
        'REEL_EMPTY',
        'No qualifying drafts for GlowUp reel.',
      );
    }

    const shareSlug = buildShareSlug('reel');
    const reelUrl = buildReelUrl(shareSlug);

    const saved = await db.query(
      `INSERT INTO glowup_reels (share_slug, reel_url, data, published_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, created_at, published_at`,
      [shareSlug, reelUrl, JSON.stringify({ items })],
    );

    return {
      id: saved.rows[0].id,
      shareSlug,
      reelUrl,
      createdAt: toIso(saved.rows[0].created_at),
      publishedAt: saved.rows[0].published_at
        ? toIso(saved.rows[0].published_at)
        : null,
      items,
    };
  }

  async generateAutopsyReport(
    limit = 5,
    client?: DbClient,
  ): Promise<AutopsyReport> {
    const db = getDb(this.pool, client);

    const drafts = await db.query(
      `SELECT id, glow_up_score
       FROM drafts
       WHERE updated_at >= NOW() - INTERVAL '24 hours'
       ORDER BY glow_up_score ASC
       LIMIT $1`,
      [limit],
    );

    if (drafts.rows.length === 0) {
      throw new ServiceError(
        'AUTOPSY_EMPTY',
        'No qualifying drafts for autopsy.',
      );
    }

    const patterns: AutopsyPattern[] = [];
    let noFixCount = 0;
    let highRejectCount = 0;
    let budgetExhaustedCount = 0;

    for (const row of drafts.rows) {
      const draftId = row.id as string;
      const fixCount = await db.query(
        'SELECT COUNT(*) FROM fix_requests WHERE draft_id = $1',
        [draftId],
      );
      const rejectCount = await db.query(
        "SELECT COUNT(*) FROM pull_requests WHERE draft_id = $1 AND status = 'rejected'",
        [draftId],
      );
      const prCount = await db.query(
        'SELECT COUNT(*) FROM pull_requests WHERE draft_id = $1',
        [draftId],
      );

      const fixTotal = Number(fixCount.rows[0].count ?? 0);
      const rejected = Number(rejectCount.rows[0].count ?? 0);
      const totalPr = Number(prCount.rows[0].count ?? 0);
      const budgetExhausted = fixTotal >= 3 || totalPr >= 7;

      if (fixTotal === 0) {
        noFixCount += 1;
      }
      if (rejected >= Math.max(1, Math.floor(totalPr / 2))) {
        highRejectCount += 1;
      }
      if (budgetExhausted) {
        budgetExhaustedCount += 1;
      }

      patterns.push({
        draftId,
        glowUpScore: Number(row.glow_up_score ?? 0),
        fixRequestCount: fixTotal,
        rejectedPrCount: rejected,
        budgetExhausted,
      });
    }

    const summaryParts: string[] = [];
    if (noFixCount > 0) {
      summaryParts.push('low fix-request activity');
    }
    if (highRejectCount > 0) {
      summaryParts.push('high rejection ratios');
    }
    if (budgetExhaustedCount > 0) {
      summaryParts.push('budget exhaustion patterns');
    }
    const summary =
      summaryParts.length > 0
        ? `Common issues: ${summaryParts.join(', ')}.`
        : "No dominant pattern detected in today's autopsy batch.";

    const shareSlug = buildShareSlug('autopsy');
    const saved = await db.query(
      `INSERT INTO autopsy_reports (share_slug, summary, data, published_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, created_at, published_at`,
      [shareSlug, summary, JSON.stringify({ patterns })],
    );

    return {
      id: saved.rows[0].id,
      shareSlug,
      summary,
      createdAt: toIso(saved.rows[0].created_at),
      publishedAt: saved.rows[0].published_at
        ? toIso(saved.rows[0].published_at)
        : null,
      patterns,
    };
  }
}
