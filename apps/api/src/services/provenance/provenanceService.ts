import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import type {
  DraftProvenanceEvent,
  DraftProvenanceSummary,
  DraftProvenanceTrail,
  ProvenanceEventType,
  ProvenanceService,
  ProvenanceStatus,
  RecordDraftCreationInput,
  RecordDraftReleaseInput,
  RecordMergedPullRequestInput,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const BRIEF_CANDIDATE_KEYS = [
  'humanBrief',
  'brief',
  'prompt',
  'description',
  'objective',
  'goal',
  'task',
] as const;

interface DraftProvenanceRow {
  draft_id: string;
  human_brief: string | null;
  human_brief_present: boolean;
  human_spark_score: number | string;
  agent_step_count: number | string;
  release_count: number | string;
  last_release_at: Date | null;
  authenticity_status: ProvenanceStatus;
  created_at: Date;
  updated_at: Date;
}

interface DraftProvenanceEventRow {
  id: number | string;
  draft_id: string;
  event_type: ProvenanceEventType;
  actor_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: Date;
}

const asNumber = (value: number | string | null | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampScore = (score: number): number =>
  Math.max(0, Math.min(100, Number(score.toFixed(2))));

const computeStatus = ({
  humanBriefPresent,
  agentStepCount,
  releaseCount,
}: {
  humanBriefPresent: boolean;
  agentStepCount: number;
  releaseCount: number;
}): ProvenanceStatus => {
  if (humanBriefPresent && agentStepCount > 0 && releaseCount > 0) {
    return 'verified';
  }
  if (humanBriefPresent || agentStepCount > 0 || releaseCount > 0) {
    return 'metadata_only';
  }
  return 'unverified';
};

const computeHumanSparkScore = ({
  humanBriefPresent,
  agentStepCount,
  releaseCount,
}: {
  humanBriefPresent: boolean;
  agentStepCount: number;
  releaseCount: number;
}): number => {
  const briefWeight = humanBriefPresent ? 35 : 5;
  const chainWeight = Math.min(agentStepCount * 12, 45);
  const releaseWeight = Math.min(releaseCount * 10, 20);
  return clampScore(briefWeight + chainWeight + releaseWeight);
};

const extractHumanBrief = (
  metadata?: Record<string, unknown>,
): string | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  for (const key of BRIEF_CANDIDATE_KEYS) {
    const raw = metadata[key];
    if (typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      return trimmed.slice(0, 2000);
    }
  }

  return null;
};

const mapSummaryRow = (row: DraftProvenanceRow): DraftProvenanceSummary => ({
  draftId: row.draft_id,
  humanBrief: row.human_brief,
  humanBriefPresent: Boolean(row.human_brief_present),
  humanSparkScore: asNumber(row.human_spark_score),
  agentStepCount: asNumber(row.agent_step_count),
  releaseCount: asNumber(row.release_count),
  lastReleaseAt: row.last_release_at,
  authenticityStatus: row.authenticity_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapEventRow = (row: DraftProvenanceEventRow): DraftProvenanceEvent => ({
  id: asNumber(row.id),
  draftId: row.draft_id,
  eventType: row.event_type,
  actorId: row.actor_id,
  payload: row.payload ?? {},
  occurredAt: row.occurred_at,
});

const defaultSummary = (draftId: string): DraftProvenanceSummary => {
  const epoch = new Date(0);
  return {
    draftId,
    humanBrief: null,
    humanBriefPresent: false,
    humanSparkScore: 0,
    agentStepCount: 0,
    releaseCount: 0,
    lastReleaseAt: null,
    authenticityStatus: 'unverified',
    createdAt: epoch,
    updatedAt: epoch,
  };
};

export class ProvenanceServiceImpl implements ProvenanceService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async recordDraftCreation(
    input: RecordDraftCreationInput,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary> {
    const db = getDb(this.pool, client);
    const current = await this.ensureSummary(input.draftId, db);
    const humanBrief = extractHumanBrief(input.metadata);
    const humanBriefPresent = current.humanBriefPresent || Boolean(humanBrief);
    const agentStepCount = current.agentStepCount;
    const releaseCount = current.releaseCount;
    const authenticityStatus = computeStatus({
      humanBriefPresent,
      agentStepCount,
      releaseCount,
    });
    const humanSparkScore = computeHumanSparkScore({
      humanBriefPresent,
      agentStepCount,
      releaseCount,
    });

    await db.query(
      `UPDATE draft_provenance
       SET human_brief = COALESCE(human_brief, $2),
           human_brief_present = $3,
           authenticity_status = $4,
           human_spark_score = $5,
           updated_at = NOW()
       WHERE draft_id = $1`,
      [
        input.draftId,
        humanBrief,
        humanBriefPresent,
        authenticityStatus,
        humanSparkScore,
      ],
    );
    await this.appendEvent(
      input.draftId,
      'draft_created',
      input.authorId,
      {
        humanBriefPresent,
      },
      db,
    );
    return this.getSummary(input.draftId, db);
  }

  async recordMergedPullRequest(
    input: RecordMergedPullRequestInput,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary> {
    const db = getDb(this.pool, client);
    const current = await this.ensureSummary(input.draftId, db);
    const humanBriefPresent = current.humanBriefPresent;
    const agentStepCount = current.agentStepCount + 1;
    const releaseCount = current.releaseCount;
    const authenticityStatus = computeStatus({
      humanBriefPresent,
      agentStepCount,
      releaseCount,
    });
    const humanSparkScore = computeHumanSparkScore({
      humanBriefPresent,
      agentStepCount,
      releaseCount,
    });

    await db.query(
      `UPDATE draft_provenance
       SET agent_step_count = $2,
           authenticity_status = $3,
           human_spark_score = $4,
           updated_at = NOW()
       WHERE draft_id = $1`,
      [input.draftId, agentStepCount, authenticityStatus, humanSparkScore],
    );
    await this.appendEvent(
      input.draftId,
      'pr_merged',
      input.makerId,
      {
        pullRequestId: input.pullRequestId,
        severity: input.severity,
        description: input.description.slice(0, 500),
      },
      db,
    );
    return this.getSummary(input.draftId, db);
  }

  async recordDraftRelease(
    input: RecordDraftReleaseInput,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary> {
    const db = getDb(this.pool, client);
    const current = await this.ensureSummary(input.draftId, db);
    const humanBriefFromMetadata = extractHumanBrief(input.metadata);
    const humanBriefPresent =
      current.humanBriefPresent || Boolean(humanBriefFromMetadata);
    const agentStepCount = current.agentStepCount;
    const releaseCount = current.releaseCount + 1;
    const authenticityStatus = computeStatus({
      humanBriefPresent,
      agentStepCount,
      releaseCount,
    });
    const humanSparkScore = computeHumanSparkScore({
      humanBriefPresent,
      agentStepCount,
      releaseCount,
    });

    await db.query(
      `UPDATE draft_provenance
       SET human_brief = COALESCE(human_brief, $2),
           human_brief_present = $3,
           release_count = $4,
           last_release_at = NOW(),
           authenticity_status = $5,
           human_spark_score = $6,
           updated_at = NOW()
       WHERE draft_id = $1`,
      [
        input.draftId,
        humanBriefFromMetadata,
        humanBriefPresent,
        releaseCount,
        authenticityStatus,
        humanSparkScore,
      ],
    );
    await this.appendEvent(
      input.draftId,
      'draft_released',
      input.releaserId,
      {
        releaseCount,
        humanBriefPresent,
      },
      db,
    );
    return this.getSummary(input.draftId, db);
  }

  async getSummary(
    draftId: string,
    client?: DbClient,
  ): Promise<DraftProvenanceSummary> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      `SELECT draft_id,
              human_brief,
              human_brief_present,
              human_spark_score,
              agent_step_count,
              release_count,
              last_release_at,
              authenticity_status,
              created_at,
              updated_at
       FROM draft_provenance
       WHERE draft_id = $1`,
      [draftId],
    );
    if (result.rows.length === 0) {
      return defaultSummary(draftId);
    }
    return mapSummaryRow(result.rows[0] as DraftProvenanceRow);
  }

  async getTrail(
    draftId: string,
    client?: DbClient,
  ): Promise<DraftProvenanceTrail> {
    const db = getDb(this.pool, client);
    const [summary, eventsResult] = await Promise.all([
      this.getSummary(draftId, db),
      db.query(
        `SELECT id, draft_id, event_type, actor_id, payload, occurred_at
         FROM draft_provenance_events
         WHERE draft_id = $1
         ORDER BY id ASC`,
        [draftId],
      ),
    ]);

    return {
      summary,
      events: eventsResult.rows.map((row) =>
        mapEventRow(row as DraftProvenanceEventRow),
      ),
    };
  }

  private async ensureSummary(
    draftId: string,
    db: DbClient,
  ): Promise<DraftProvenanceSummary> {
    await db.query(
      `INSERT INTO draft_provenance (draft_id)
       VALUES ($1)
       ON CONFLICT (draft_id) DO NOTHING`,
      [draftId],
    );
    return this.getSummary(draftId, db);
  }

  private async appendEvent(
    draftId: string,
    eventType: ProvenanceEventType,
    actorId: string | null,
    payload: Record<string, unknown>,
    db: DbClient,
  ): Promise<void> {
    await db.query(
      `INSERT INTO draft_provenance_events (draft_id, event_type, actor_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [draftId, eventType, actorId, JSON.stringify(payload)],
    );
  }
}
