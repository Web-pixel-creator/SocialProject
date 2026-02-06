import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  CreateDraftInput,
  Draft,
  DraftFilters,
  PostService,
  Version,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const mapDraft = (row: any): Draft => ({
  id: row.id,
  authorId: row.author_id,
  currentVersion: Number(row.current_version),
  status: row.status,
  glowUpScore: Number(row.glow_up_score),
  isSandbox: row.is_sandbox ?? false,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapVersion = (row: any): Version => ({
  id: row.id,
  draftId: row.draft_id,
  versionNumber: Number(row.version_number),
  imageUrl: row.image_url,
  thumbnailUrl: row.thumbnail_url,
  createdBy: row.created_by,
  pullRequestId: row.pull_request_id,
  createdAt: row.created_at,
});

export class PostServiceImpl implements PostService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createDraft(
    input: CreateDraftInput,
    client?: DbClient,
  ): Promise<{ draft: Draft; version: Version }> {
    const db = getDb(this.pool, client);

    if (!input.authorId) {
      throw new ServiceError('AUTHOR_REQUIRED', 'Author is required.');
    }

    if (!(input.imageUrl && input.thumbnailUrl)) {
      throw new ServiceError(
        'VERSION_MEDIA_REQUIRED',
        'Initial version image and thumbnail are required.',
      );
    }

    const metadata = input.metadata ?? {};

    const draftResult = await db.query(
      'INSERT INTO drafts (author_id, metadata, is_sandbox) VALUES ($1, $2, $3) RETURNING *',
      [input.authorId, metadata, input.isSandbox ?? false],
    );

    const draftRow = draftResult.rows[0];
    const versionResult = await db.query(
      'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [draftRow.id, 1, input.imageUrl, input.thumbnailUrl, input.authorId],
    );

    return {
      draft: mapDraft(draftRow),
      version: mapVersion(versionResult.rows[0]),
    };
  }

  async getDraft(draftId: string, client?: DbClient): Promise<Draft> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT * FROM drafts WHERE id = $1', [
      draftId,
    ]);

    if (result.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    return mapDraft(result.rows[0]);
  }

  async getDraftWithVersions(
    draftId: string,
    client?: DbClient,
  ): Promise<{ draft: Draft; versions: Version[] }> {
    const draft = await this.getDraft(draftId, client);
    const versions = await this.getVersions(draftId, client);
    return { draft, versions };
  }

  async listDrafts(filters: DraftFilters, client?: DbClient): Promise<Draft[]> {
    const db = getDb(this.pool, client);
    const { status, authorId, limit = 20, offset = 0 } = filters;

    const result = await db.query(
      `SELECT * FROM drafts
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::uuid IS NULL OR author_id = $2)
         AND is_sandbox = false
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4`,
      [status ?? null, authorId ?? null, limit, offset],
    );

    return result.rows.map(mapDraft);
  }

  async releaseDraft(draftId: string, client?: DbClient): Promise<Draft> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'UPDATE drafts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['release', draftId],
    );

    if (result.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    return mapDraft(result.rows[0]);
  }

  async getVersions(draftId: string, client?: DbClient): Promise<Version[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT * FROM versions WHERE draft_id = $1 ORDER BY version_number ASC',
      [draftId],
    );
    return result.rows.map(mapVersion);
  }
}
