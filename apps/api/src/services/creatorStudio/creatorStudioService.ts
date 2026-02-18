import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  CreateCreatorStudioInput,
  CreatorFunnelSummary,
  CreatorGovernance,
  CreatorModerationMode,
  CreatorOnboardingStep,
  CreatorStudio,
  CreatorStudioEventType,
  CreatorStudioListFilters,
  CreatorStudioService,
  CreatorStudioStatus,
  CreatorStylePreset,
  UpdateCreatorGovernanceInput,
} from './types';

const DEFAULT_GOVERNANCE: CreatorGovernance = {
  autoApproveThreshold: 0.75,
  majorPrRequiresHuman: true,
  allowForks: true,
  moderationMode: 'balanced',
};

const STYLE_PRESETS: CreatorStylePreset[] = [
  'balanced',
  'bold',
  'minimal',
  'experimental',
];
const MODERATION_MODES: CreatorModerationMode[] = [
  'strict',
  'balanced',
  'open',
];

interface CreatorStudioRow {
  id: string;
  owner_user_id: string;
  studio_name: string;
  tagline: string;
  style_preset: CreatorStylePreset;
  governance: CreatorGovernance | string;
  revenue_share_percent: number | string;
  status: CreatorStudioStatus;
  onboarding_step: CreatorOnboardingStep;
  onboarding_completed_at: Date | null;
  retention_score: number | string;
  created_at: Date;
  updated_at: Date;
  last_event_at?: Date | null;
}

const safeParseGovernance = (
  value: CreatorStudioRow['governance'],
): CreatorGovernance => {
  if (!value) {
    return { ...DEFAULT_GOVERNANCE };
  }
  try {
    const parsed =
      typeof value === 'string'
        ? (JSON.parse(value) as Partial<CreatorGovernance>)
        : (value as Partial<CreatorGovernance>);
    return {
      autoApproveThreshold: Number(
        parsed.autoApproveThreshold ?? DEFAULT_GOVERNANCE.autoApproveThreshold,
      ),
      majorPrRequiresHuman:
        parsed.majorPrRequiresHuman ?? DEFAULT_GOVERNANCE.majorPrRequiresHuman,
      allowForks: parsed.allowForks ?? DEFAULT_GOVERNANCE.allowForks,
      moderationMode: MODERATION_MODES.includes(
        parsed.moderationMode as CreatorModerationMode,
      )
        ? (parsed.moderationMode as CreatorModerationMode)
        : DEFAULT_GOVERNANCE.moderationMode,
    };
  } catch {
    return { ...DEFAULT_GOVERNANCE };
  }
};

const mapStudio = (row: CreatorStudioRow): CreatorStudio => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  studioName: row.studio_name,
  tagline: row.tagline,
  stylePreset: row.style_preset,
  governance: safeParseGovernance(row.governance),
  revenueSharePercent: Number(row.revenue_share_percent),
  status: row.status,
  onboardingStep: row.onboarding_step,
  onboardingCompletedAt: row.onboarding_completed_at,
  retentionScore: Number(row.retention_score),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastEventAt: row.last_event_at ?? null,
});

const normalizeShare = (value: number | undefined): number => {
  const share = value ?? 15;
  if (!Number.isFinite(share) || share < 0 || share > 100) {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_REVENUE_SHARE',
      'Revenue share percent must be between 0 and 100.',
      400,
    );
  }
  return Number(share.toFixed(2));
};

const normalizeThreshold = (value: number | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_THRESHOLD',
      'autoApproveThreshold must be between 0 and 1.',
      400,
    );
  }
  return Number(value.toFixed(3));
};

const buildGovernance = (
  base: CreatorGovernance,
  patch?: Partial<CreatorGovernance>,
): CreatorGovernance => {
  if (!patch) {
    return base;
  }

  const threshold = normalizeThreshold(patch.autoApproveThreshold);
  if (
    patch.moderationMode !== undefined &&
    !MODERATION_MODES.includes(patch.moderationMode)
  ) {
    throw new ServiceError(
      'CREATOR_STUDIO_INVALID_MODERATION_MODE',
      'moderationMode must be strict, balanced, or open.',
      400,
    );
  }

  return {
    autoApproveThreshold: threshold ?? base.autoApproveThreshold,
    majorPrRequiresHuman:
      patch.majorPrRequiresHuman ?? base.majorPrRequiresHuman,
    allowForks: patch.allowForks ?? base.allowForks,
    moderationMode: patch.moderationMode ?? base.moderationMode,
  };
};

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

export class CreatorStudioServiceImpl implements CreatorStudioService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createStudio(
    ownerUserId: string,
    input: CreateCreatorStudioInput,
    client?: DbClient,
  ): Promise<CreatorStudio> {
    const studioName = input.studioName?.trim();
    if (!studioName) {
      throw new ServiceError(
        'CREATOR_STUDIO_INVALID_NAME',
        'studioName is required.',
        400,
      );
    }
    if (studioName.length > 120) {
      throw new ServiceError(
        'CREATOR_STUDIO_INVALID_NAME',
        'studioName must be 120 characters or less.',
        400,
      );
    }

    const tagline = input.tagline?.trim() ?? '';
    if (tagline.length > 220) {
      throw new ServiceError(
        'CREATOR_STUDIO_INVALID_TAGLINE',
        'tagline must be 220 characters or less.',
        400,
      );
    }

    const stylePreset = input.stylePreset ?? 'balanced';
    if (!STYLE_PRESETS.includes(stylePreset)) {
      throw new ServiceError(
        'CREATOR_STUDIO_INVALID_STYLE_PRESET',
        'stylePreset is invalid.',
        400,
      );
    }

    const revenueSharePercent = normalizeShare(input.revenueSharePercent);
    const db = getDb(this.pool, client);

    const created = await db.query(
      `INSERT INTO creator_studios (
         owner_user_id,
         studio_name,
         tagline,
         style_preset,
         governance,
         revenue_share_percent,
         status,
         onboarding_step
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'draft', 'profile')
       RETURNING *`,
      [
        ownerUserId,
        studioName,
        tagline,
        stylePreset,
        JSON.stringify(DEFAULT_GOVERNANCE),
        revenueSharePercent,
      ],
    );

    const row = created.rows[0] as CreatorStudioRow | undefined;
    if (!row) {
      throw new ServiceError(
        'CREATOR_STUDIO_CREATE_FAILED',
        'Failed to create creator studio.',
        500,
      );
    }

    await this.recordEvent(db, row.id, ownerUserId, 'created', {
      stylePreset,
      revenueSharePercent,
    });

    if (tagline.length > 0) {
      await this.recordEvent(db, row.id, ownerUserId, 'profile_completed', {
        taglineLength: tagline.length,
      });
    }

    const studio = await this.getStudio(row.id, db);
    if (!studio) {
      throw new ServiceError(
        'CREATOR_STUDIO_NOT_FOUND',
        'Creator studio not found after creation.',
        500,
      );
    }

    return studio;
  }

  async listStudios(
    filters: CreatorStudioListFilters = {},
    client?: DbClient,
  ): Promise<CreatorStudio[]> {
    const db = getDb(this.pool, client);
    const limit = Math.min(Math.max(filters.limit ?? 10, 1), 50);
    const offset = Math.max(filters.offset ?? 0, 0);

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.status) {
      params.push(filters.status);
      where.push(`s.status = $${params.length}`);
    }
    if (filters.ownerUserId) {
      params.push(filters.ownerUserId);
      where.push(`s.owner_user_id = $${params.length}`);
    }

    params.push(limit, offset);
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const result = await db.query(
      `SELECT s.*,
              MAX(e.created_at) AS last_event_at
       FROM creator_studios s
       LEFT JOIN creator_studio_events e ON e.studio_id = s.id
       ${whereSql}
       GROUP BY s.id
       ORDER BY s.updated_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );

    return result.rows.map((row) => mapStudio(row as CreatorStudioRow));
  }

  async getStudio(
    id: string,
    client?: DbClient,
  ): Promise<CreatorStudio | null> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      `SELECT s.*,
              MAX(e.created_at) AS last_event_at
       FROM creator_studios s
       LEFT JOIN creator_studio_events e ON e.studio_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id],
    );

    const row = result.rows[0] as CreatorStudioRow | undefined;
    return row ? mapStudio(row) : null;
  }

  async updateGovernance(
    id: string,
    ownerUserId: string,
    input: UpdateCreatorGovernanceInput,
    client?: DbClient,
  ): Promise<CreatorStudio> {
    const db = getDb(this.pool, client);
    const current = await this.requireOwnedStudio(id, ownerUserId, db);

    const nextGovernance = buildGovernance(
      current.governance,
      input.governance,
    );
    const nextShare =
      input.revenueSharePercent === undefined
        ? current.revenueSharePercent
        : normalizeShare(input.revenueSharePercent);

    await db.query(
      `UPDATE creator_studios
       SET governance = $2::jsonb,
           revenue_share_percent = $3,
           onboarding_step = CASE
             WHEN onboarding_step = 'profile' THEN 'governance'
             ELSE onboarding_step
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(nextGovernance), nextShare],
    );

    await this.recordEvent(db, id, ownerUserId, 'governance_configured', {
      autoApproveThreshold: nextGovernance.autoApproveThreshold,
      moderationMode: nextGovernance.moderationMode,
      revenueSharePercent: nextShare,
    });

    const updated = await this.getStudio(id, db);
    if (!updated) {
      throw new ServiceError(
        'CREATOR_STUDIO_NOT_FOUND',
        'Creator studio not found.',
        404,
      );
    }

    return updated;
  }

  async connectBilling(
    id: string,
    ownerUserId: string,
    providerAccountId?: string,
    client?: DbClient,
  ): Promise<CreatorStudio> {
    const db = getDb(this.pool, client);
    await this.requireOwnedStudio(id, ownerUserId, db);

    await db.query(
      `UPDATE creator_studios
       SET status = 'active',
           onboarding_step = 'ready',
           onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [id],
    );

    await this.recordEvent(db, id, ownerUserId, 'billing_connected', {
      providerAccountId: providerAccountId ?? null,
    });
    await this.recordEvent(db, id, ownerUserId, 'activated', {
      source: 'billing-connect',
    });

    const updated = await this.getStudio(id, db);
    if (!updated) {
      throw new ServiceError(
        'CREATOR_STUDIO_NOT_FOUND',
        'Creator studio not found.',
        404,
      );
    }

    return updated;
  }

  async retentionPing(
    id: string,
    ownerUserId: string,
    client?: DbClient,
  ): Promise<CreatorStudio> {
    const db = getDb(this.pool, client);
    await this.requireOwnedStudio(id, ownerUserId, db);

    await db.query(
      `UPDATE creator_studios
       SET retention_score = LEAST(100, retention_score + 2.5),
           updated_at = NOW()
       WHERE id = $1`,
      [id],
    );

    await this.recordEvent(db, id, ownerUserId, 'retention_ping', {
      source: 'manual',
    });

    const updated = await this.getStudio(id, db);
    if (!updated) {
      throw new ServiceError(
        'CREATOR_STUDIO_NOT_FOUND',
        'Creator studio not found.',
        404,
      );
    }

    return updated;
  }

  async getFunnelSummary(
    ownerUserId: string,
    windowDays = 30,
    client?: DbClient,
  ): Promise<CreatorFunnelSummary> {
    const db = getDb(this.pool, client);
    const safeWindow = Math.min(Math.max(windowDays, 1), 365);

    const result = await db.query(
      `SELECT event_type,
              COUNT(*)::int AS total
       FROM creator_studio_events
       WHERE owner_user_id = $1
         AND created_at >= NOW() - ($2 * INTERVAL '1 day')
       GROUP BY event_type`,
      [ownerUserId, safeWindow],
    );

    const totals = new Map<string, number>();
    for (const row of result.rows as Array<{
      event_type: string;
      total: number | string;
    }>) {
      totals.set(row.event_type, Number(row.total ?? 0));
    }

    const created = totals.get('created') ?? 0;
    const activated = totals.get('activated') ?? 0;
    const activationRatePercent =
      created === 0 ? 0 : Number(((activated / created) * 100).toFixed(2));

    return {
      windowDays: safeWindow,
      created,
      profileCompleted: totals.get('profile_completed') ?? 0,
      governanceConfigured: totals.get('governance_configured') ?? 0,
      billingConnected: totals.get('billing_connected') ?? 0,
      activated,
      retentionPing: totals.get('retention_ping') ?? 0,
      activationRatePercent,
    };
  }

  private async requireOwnedStudio(
    studioId: string,
    ownerUserId: string,
    db: DbClient,
  ): Promise<CreatorStudio> {
    const studio = await this.getStudio(studioId, db);
    if (!studio) {
      throw new ServiceError(
        'CREATOR_STUDIO_NOT_FOUND',
        'Creator studio not found.',
        404,
      );
    }
    if (studio.ownerUserId !== ownerUserId) {
      throw new ServiceError(
        'CREATOR_STUDIO_FORBIDDEN',
        'You do not own this creator studio.',
        403,
      );
    }
    return studio;
  }

  private async recordEvent(
    db: DbClient,
    studioId: string,
    ownerUserId: string,
    eventType: CreatorStudioEventType,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await db.query(
      `INSERT INTO creator_studio_events (
         studio_id,
         owner_user_id,
         event_type,
         metadata
       )
       VALUES ($1, $2, $3, $4::jsonb)`,
      [studioId, ownerUserId, eventType, JSON.stringify(metadata)],
    );
  }
}
