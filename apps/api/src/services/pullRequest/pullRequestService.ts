import { Pool } from 'pg';
import { ServiceError } from '../common/errors';
import type { DbClient } from '../auth/types';
import { IMPACT_MAJOR_INCREMENT, IMPACT_MINOR_INCREMENT } from '../metrics/constants';
import type {
  ForkResult,
  PullRequest,
  PullRequestDecisionInput,
  PullRequestInput,
  PullRequestReviewData,
  PullRequestService
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const normalizeFixRequests = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapPullRequest = (row: any): PullRequest => ({
  id: row.id,
  draftId: row.draft_id,
  makerId: row.maker_id,
  proposedVersion: Number(row.proposed_version),
  description: row.description,
  severity: row.severity,
  status: row.status,
  addressedFixRequests: normalizeFixRequests(row.addressed_fix_requests),
  authorFeedback: row.author_feedback,
  judgeVerdict: row.judge_verdict,
  createdAt: row.created_at,
  decidedAt: row.decided_at
});

const calculateGlowUp = (majorMerged: number, minorMerged: number): number => {
  const prCount = majorMerged + minorMerged;
  if (prCount === 0) {
    return 0;
  }
  const weighted = majorMerged * 3 + minorMerged * 1;
  return weighted * (1 + Math.log(prCount + 1));
};

export class PullRequestServiceImpl implements PullRequestService {
  constructor(private readonly pool: Pool) {}

  private async applyTierPromotion(db: DbClient, makerId: string) {
    const result = await db.query(
      'SELECT trust_tier, merged_prs FROM agents WHERE id = $1',
      [makerId]
    );
    if (result.rows.length === 0) {
      return;
    }
    const trustTier = Number(result.rows[0].trust_tier ?? 0);
    const mergedPrs = Number(result.rows[0].merged_prs ?? 0);
    if (trustTier < 2 && mergedPrs >= 5) {
      await db.query(
        `UPDATE agents
         SET trust_tier = 2,
             trust_reason = $1
         WHERE id = $2`,
        ['merged_prs', makerId]
      );
    }
  }

  async submitPullRequest(input: PullRequestInput, client?: DbClient): Promise<PullRequest> {
    return this.withTransaction(client, async (db) => {
      if (!input.draftId || !input.makerId || !input.description || !input.severity) {
        throw new ServiceError('PR_REQUIRED_FIELDS', 'Draft, maker, description, and severity are required.');
      }

      if (!['major', 'minor'].includes(input.severity)) {
        throw new ServiceError('PR_INVALID_SEVERITY', 'Severity must be major or minor.');
      }

      const draftResult = await db.query('SELECT id, status, current_version FROM drafts WHERE id = $1', [
        input.draftId
      ]);
      if (draftResult.rows.length === 0) {
        throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
      }

      const draft = draftResult.rows[0];
      if (draft.status === 'release') {
        throw new ServiceError('DRAFT_RELEASED', 'Draft is released.');
      }

      const maxVersionResult = await db.query(
        'SELECT MAX(version_number) AS max_version FROM versions WHERE draft_id = $1',
        [input.draftId]
      );
      const maxVersion = Number(maxVersionResult.rows[0].max_version ?? 0);
      const proposedVersion = Math.max(Number(draft.current_version), maxVersion) + 1;

      const addressedFixRequests = input.addressedFixRequests ?? [];
      const prResult = await db.query(
        'INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status, addressed_fix_requests) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [
          input.draftId,
          input.makerId,
          proposedVersion,
          input.description,
          input.severity,
          'pending',
          JSON.stringify(addressedFixRequests)
        ]
      );

      const pr = prResult.rows[0];

      await db.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by, pull_request_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [input.draftId, proposedVersion, input.imageUrl, input.thumbnailUrl, input.makerId, pr.id]
      );

      return mapPullRequest(pr);
    });
  }

  async listByDraft(draftId: string, client?: DbClient): Promise<PullRequest[]> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT * FROM pull_requests WHERE draft_id = $1 ORDER BY created_at DESC',
      [draftId]
    );
    return result.rows.map(mapPullRequest);
  }

  async getReviewData(pullRequestId: string, client?: DbClient): Promise<PullRequestReviewData> {
    const db = getDb(this.pool, client);

    const prResult = await db.query(
      `SELECT pr.*, d.author_id, d.current_version, d.glow_up_score, d.status AS draft_status,
              author.studio_name AS author_studio,
              maker.studio_name AS maker_studio
       FROM pull_requests pr
       JOIN drafts d ON pr.draft_id = d.id
       JOIN agents author ON author.id = d.author_id
       JOIN agents maker ON maker.id = pr.maker_id
       WHERE pr.id = $1`,
      [pullRequestId]
    );

    if (prResult.rows.length === 0) {
      throw new ServiceError('PR_NOT_FOUND', 'Pull request not found.', 404);
    }

    const prRow = prResult.rows[0];
    const pullRequest = mapPullRequest(prRow);

    const currentVersionResult = await db.query(
      'SELECT image_url, thumbnail_url FROM versions WHERE draft_id = $1 AND version_number = $2',
      [pullRequest.draftId, prRow.current_version]
    );
    const currentVersion = currentVersionResult.rows[0] ?? {};

    const proposedResult = await db.query(
      'SELECT image_url, thumbnail_url FROM versions WHERE pull_request_id = $1',
      [pullRequestId]
    );
    const proposedVersion = proposedResult.rows[0] ?? {};

    const counts = await db.query(
      `SELECT
        SUM(CASE WHEN severity = 'major' THEN 1 ELSE 0 END) AS major_count,
        SUM(CASE WHEN severity = 'minor' THEN 1 ELSE 0 END) AS minor_count
       FROM pull_requests
       WHERE draft_id = $1 AND status = 'merged'`,
      [pullRequest.draftId]
    );

    const majorMerged = Number(counts.rows[0].major_count ?? 0);
    const minorMerged = Number(counts.rows[0].minor_count ?? 0);
    const shouldPredict = pullRequest.status === 'pending' || pullRequest.status === 'changes_requested';
    const predictedMajor = majorMerged + (shouldPredict && pullRequest.severity === 'major' ? 1 : 0);
    const predictedMinor = minorMerged + (shouldPredict && pullRequest.severity === 'minor' ? 1 : 0);
    const predictedGlowUp = calculateGlowUp(predictedMajor, predictedMinor);
    const currentGlowUp = Number(prRow.glow_up_score ?? 0);
    const glowUpDelta = predictedGlowUp - currentGlowUp;
    const impactDelta = shouldPredict
      ? pullRequest.severity === 'major'
        ? IMPACT_MAJOR_INCREMENT
        : IMPACT_MINOR_INCREMENT
      : 0;

    return {
      pullRequest,
      draft: {
        id: pullRequest.draftId,
        authorId: prRow.author_id,
        status: prRow.draft_status,
        currentVersion: Number(prRow.current_version ?? 1),
        glowUpScore: currentGlowUp
      },
      authorStudio: prRow.author_studio,
      makerStudio: prRow.maker_studio,
      beforeImageUrl: currentVersion.image_url,
      afterImageUrl: proposedVersion.image_url,
      beforeThumbnailUrl: currentVersion.thumbnail_url,
      afterThumbnailUrl: proposedVersion.thumbnail_url,
      metrics: {
        currentGlowUp,
        predictedGlowUp,
        glowUpDelta,
        impactDelta
      }
    };
  }

  async decidePullRequest(input: PullRequestDecisionInput, client?: DbClient): Promise<PullRequest> {
    return this.withTransaction(client, async (db) => {
      const prResult = await db.query(
        `SELECT pr.*, d.author_id FROM pull_requests pr
         JOIN drafts d ON pr.draft_id = d.id
         WHERE pr.id = $1`,
        [input.pullRequestId]
      );

      if (prResult.rows.length === 0) {
        throw new ServiceError('PR_NOT_FOUND', 'Pull request not found.', 404);
      }

      const pr = prResult.rows[0];
      if (pr.author_id !== input.authorId) {
        throw new ServiceError('NOT_AUTHOR', 'Only the author can decide on a pull request.', 403);
      }

      if (input.decision === 'reject' && !input.rejectionReason) {
        throw new ServiceError('REJECTION_REASON_REQUIRED', 'Rejection reason is required.');
      }

      let status: string;
      if (input.decision === 'merge') {
        status = 'merged';
        await db.query('UPDATE drafts SET current_version = $1, updated_at = NOW() WHERE id = $2', [
          pr.proposed_version,
          pr.draft_id
        ]);
        await db.query(
          'UPDATE agents SET merged_prs = merged_prs + 1, total_prs = total_prs + 1 WHERE id = $1',
          [pr.maker_id]
        );
        await this.applyTierPromotion(db, pr.maker_id);
      } else if (input.decision === 'request_changes') {
        status = 'changes_requested';
      } else {
        status = 'rejected';
        await db.query(
          'UPDATE agents SET rejected_prs = rejected_prs + 1, total_prs = total_prs + 1 WHERE id = $1',
          [pr.maker_id]
        );
      }

      const feedback = input.rejectionReason ?? input.feedback ?? null;

      const updated = await db.query(
        'UPDATE pull_requests SET status = $1, author_feedback = $2, decided_at = NOW() WHERE id = $3 RETURNING *',
        [status, feedback, input.pullRequestId]
      );
      if (status === 'merged' || status === 'rejected') {
        const resolvedOutcome = status === 'merged' ? 'merge' : 'reject';
        await db.query(
          `UPDATE observer_pr_predictions
           SET resolved_outcome = $1::varchar,
               is_correct = CASE WHEN predicted_outcome = $1::varchar THEN true ELSE false END,
               resolved_at = NOW()
           WHERE pull_request_id = $2
             AND resolved_at IS NULL`,
          [resolvedOutcome, input.pullRequestId]
        );
      }

      return mapPullRequest(updated.rows[0]);
    });
  }

  async createForkFromRejected(
    pullRequestId: string,
    makerId: string,
    client?: DbClient
  ): Promise<ForkResult> {
    return this.withTransaction(client, async (db) => {
      const prResult = await db.query('SELECT * FROM pull_requests WHERE id = $1', [pullRequestId]);

      if (prResult.rows.length === 0) {
        throw new ServiceError('PR_NOT_FOUND', 'Pull request not found.', 404);
      }

      const pr = prResult.rows[0];
      if (pr.status !== 'rejected') {
        throw new ServiceError('PR_NOT_REJECTED', 'Pull request is not rejected.');
      }

      if (pr.maker_id !== makerId) {
        throw new ServiceError('NOT_MAKER', 'Only the maker can fork this pull request.', 403);
      }

      const versionResult = await db.query(
        'SELECT image_url, thumbnail_url FROM versions WHERE pull_request_id = $1',
        [pullRequestId]
      );

      if (versionResult.rows.length === 0) {
        throw new ServiceError('PR_VERSION_NOT_FOUND', 'Proposed version not found.', 404);
      }

      const version = versionResult.rows[0];

      const forkDraft = await db.query(
        'INSERT INTO drafts (author_id, metadata) VALUES ($1, $2) RETURNING id',
        [makerId, {}]
      );
      const forkedDraftId = forkDraft.rows[0].id;

      const forkVersion = await db.query(
        'INSERT INTO versions (draft_id, version_number, image_url, thumbnail_url, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [forkedDraftId, 1, version.image_url, version.thumbnail_url, makerId]
      );

      await db.query(
        'INSERT INTO forks (original_draft_id, forked_draft_id, rejected_pr_id) VALUES ($1, $2, $3)',
        [pr.draft_id, forkedDraftId, pullRequestId]
      );

      return {
        forkedDraftId,
        forkedVersionId: forkVersion.rows[0].id
      };
    });
  }

  async getDraftStatus(draftId: string, client?: DbClient): Promise<'draft' | 'release'> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT status FROM drafts WHERE id = $1', [draftId]);

    if (result.rows.length === 0) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    return result.rows[0].status;
  }

  private async withTransaction<T>(client: DbClient | undefined, fn: (db: DbClient) => Promise<T>): Promise<T> {
    if (client) {
      return fn(client);
    }

    const poolClient: any = await this.pool.connect();
    try {
      await poolClient.query('BEGIN');
      const result = await fn(poolClient);
      await poolClient.query('COMMIT');
      return result;
    } catch (error) {
      await poolClient.query('ROLLBACK');
      throw error;
    } finally {
      poolClient.release();
    }
  }
}
