import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  FixRequest,
  FixRequestCategory,
  FixRequestInput,
  FixRequestService,
} from './types';

const VALID_CATEGORIES: FixRequestCategory[] = [
  'Focus',
  'Cohesion',
  'Readability',
  'Composition',
  'Color/Light',
  'Story/Intent',
  'Technical',
];

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

interface FixRequestRow {
  id: string;
  draft_id: string;
  critic_id: string;
  category: FixRequestCategory;
  description: string;
  coordinates: Record<string, unknown> | null;
  target_version: number;
  created_at: Date;
}

const mapFixRequest = (row: FixRequestRow): FixRequest => ({
  id: row.id,
  draftId: row.draft_id,
  criticId: row.critic_id,
  category: row.category,
  description: row.description,
  coordinates: row.coordinates,
  targetVersion: Number(row.target_version),
  createdAt: row.created_at,
});

export class FixRequestServiceImpl implements FixRequestService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async submitFixRequest(
    input: FixRequestInput,
    client?: DbClient,
  ): Promise<FixRequest> {
    const db = getDb(this.pool, client);

    if (!(input.draftId && input.criticId && input.description)) {
      throw new ServiceError(
        'FIX_REQUEST_REQUIRED_FIELDS',
        'Draft, critic, and description are required.',
      );
    }

    if (!VALID_CATEGORIES.includes(input.category)) {
      throw new ServiceError(
        'FIX_REQUEST_INVALID_CATEGORY',
        'Invalid diagnosis category.',
      );
    }

    const draftResult = await db.query(
      'SELECT status, current_version FROM drafts WHERE id = $1',
      [input.draftId],
    );
    if (draftResult.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    const draft = draftResult.rows[0];
    if (draft.status === 'release') {
      throw new ServiceError('DRAFT_RELEASED', 'Draft is released.');
    }

    const coordinatesValue = input.coordinates ?? null;

    const result = await db.query(
      'INSERT INTO fix_requests (draft_id, critic_id, category, description, coordinates, target_version, created_at) VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp()) RETURNING *',
      [
        input.draftId,
        input.criticId,
        input.category,
        input.description,
        coordinatesValue,
        draft.current_version,
      ],
    );

    return mapFixRequest(result.rows[0] as FixRequestRow);
  }

  async listByDraft(draftId: string, client?: DbClient): Promise<FixRequest[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT * FROM fix_requests WHERE draft_id = $1 ORDER BY created_at ASC',
      [draftId],
    );
    return result.rows.map((row) => mapFixRequest(row as FixRequestRow));
  }

  async listByCritic(
    criticId: string,
    client?: DbClient,
  ): Promise<FixRequest[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT * FROM fix_requests WHERE critic_id = $1 ORDER BY created_at DESC',
      [criticId],
    );
    return result.rows.map((row) => mapFixRequest(row as FixRequestRow));
  }
}
