import { Pool } from 'pg';
import { DraftArcServiceImpl } from '../services/observer/draftArcService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const service = new DraftArcServiceImpl(pool);

describe('observer draft arc service', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('returns fallback arc and empty 24h recap for quiet draft', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Arc Quiet', 'tester', 'hash_arc_quiet') RETURNING id",
      );
      const draft = await client.query(
        'INSERT INTO drafts (author_id, status, metadata) VALUES ($1, \'draft\', \'{"title":"Quiet"}\') RETURNING id',
        [agent.rows[0].id],
      );

      const arc = await service.getDraftArc(draft.rows[0].id, client);
      expect(arc.summary.state).toBe('needs_help');
      expect(arc.summary.latestMilestone).toBe('No activity yet');
      expect(arc.summary.fixOpenCount).toBe(0);
      expect(arc.summary.prPendingCount).toBe(0);
      expect(arc.recap24h.hasChanges).toBe(false);
      expect(arc.recap24h.glowUpDelta).toBeNull();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('transitions through in_progress and ready_for_review states', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Arc Active', 'tester', 'hash_arc_active') RETURNING id",
      );
      const draft = await client.query(
        "INSERT INTO drafts (author_id, status) VALUES ($1, 'draft') RETURNING id",
        [agent.rows[0].id],
      );

      await client.query(
        "INSERT INTO fix_requests (draft_id, critic_id, category, description, target_version) VALUES ($1, $2, 'Focus', 'Need contrast', 1)",
        [draft.rows[0].id, agent.rows[0].id],
      );

      const arcAfterFix = await service.recomputeDraftArcSummary(
        draft.rows[0].id,
        client,
      );
      expect(arcAfterFix.state).toBe('in_progress');
      expect(arcAfterFix.fixOpenCount).toBe(1);

      await client.query(
        `INSERT INTO pull_requests (
           draft_id, maker_id, proposed_version, description, severity, status, addressed_fix_requests
         ) VALUES ($1, $2, 2, 'Apply contrast', 'minor', 'pending', $3)`,
        [draft.rows[0].id, agent.rows[0].id, JSON.stringify([])],
      );

      const arcAfterPr = await service.recomputeDraftArcSummary(
        draft.rows[0].id,
        client,
      );
      expect(arcAfterPr.state).toBe('ready_for_review');
      expect(arcAfterPr.prPendingCount).toBe(1);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('creates and deduplicates digest entries for followed drafts', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const user = await client.query(
        `INSERT INTO users (
           email, password_hash, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at
         ) VALUES ('observer-arc@example.com', 'hash', 'v1', NOW(), 'v1', NOW()) RETURNING id`,
      );
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Arc Digest', 'tester', 'hash_arc_digest') RETURNING id",
      );
      const draft = await client.query(
        "INSERT INTO drafts (author_id, status) VALUES ($1, 'draft') RETURNING id",
        [agent.rows[0].id],
      );

      await service.followDraft(user.rows[0].id, draft.rows[0].id, client);
      await service.recordDraftEvent(draft.rows[0].id, 'manual', client);
      await service.recordDraftEvent(draft.rows[0].id, 'manual', client);

      const digestRows = await client.query(
        'SELECT id FROM observer_digest_entries WHERE observer_id = $1 AND draft_id = $2',
        [user.rows[0].id, draft.rows[0].id],
      );
      expect(digestRows.rows).toHaveLength(1);

      const digest = await service.listDigest(
        user.rows[0].id,
        { unseenOnly: true },
        client,
      );
      expect(digest).toHaveLength(1);
      expect(digest[0].isSeen).toBe(false);

      const seen = await service.markDigestSeen(
        user.rows[0].id,
        digest[0].id,
        client,
      );
      expect(seen.isSeen).toBe(true);

      const unseen = await service.listDigest(
        user.rows[0].id,
        { unseenOnly: true },
        client,
      );
      expect(unseen).toHaveLength(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('creates digest entries when observer follows the draft studio', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const user = await client.query(
        `INSERT INTO users (
           email, password_hash, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at
         ) VALUES ('observer-studio-follow@example.com', 'hash', 'v1', NOW(), 'v1', NOW()) RETURNING id`,
      );
      const agent = await client.query(
        "INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ('Arc Studio Follow', 'tester', 'hash_arc_studio_follow') RETURNING id",
      );
      const draft = await client.query(
        "INSERT INTO drafts (author_id, status) VALUES ($1, 'draft') RETURNING id",
        [agent.rows[0].id],
      );

      await client.query(
        `INSERT INTO observer_studio_follows (observer_id, studio_id)
         VALUES ($1, $2)`,
        [user.rows[0].id, agent.rows[0].id],
      );

      await service.recordDraftEvent(draft.rows[0].id, 'manual', client);

      const digestRows = await client.query(
        `SELECT id
         FROM observer_digest_entries
         WHERE observer_id = $1
           AND draft_id = $2`,
        [user.rows[0].id, draft.rows[0].id],
      );

      expect(digestRows.rows).toHaveLength(1);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('submits prediction and returns summary consensus', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ resolved_count: 20, correct_count: 12 }],
        })
        .mockResolvedValueOnce({
          rows: [{ submission_count: 3, stake_points: 90 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'pred-1',
              observer_id: 'observer-1',
              pull_request_id: 'pr-1',
              predicted_outcome: 'merge',
              stake_points: 25,
              payout_points: 0,
              resolved_outcome: null,
              is_correct: null,
              created_at: new Date().toISOString(),
              resolved_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'pr-1', status: 'pending' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              merge_count: 2,
              reject_count: 1,
              merge_stake_points: 45,
              reject_stake_points: 20,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'pred-1',
              observer_id: 'observer-1',
              pull_request_id: 'pr-1',
              predicted_outcome: 'merge',
              stake_points: 25,
              payout_points: 0,
              resolved_outcome: null,
              is_correct: null,
              created_at: new Date().toISOString(),
              resolved_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ correct_count: 3, total_count: 5 }],
        })
        .mockResolvedValueOnce({
          rows: [{ observer_net_points: 18 }],
        })
        .mockResolvedValueOnce({
          rows: [{ resolved_count: 20, correct_count: 12 }],
        })
        .mockResolvedValueOnce({
          rows: [{ submission_count: 4, stake_points: 140 }],
        }),
    } as any;

    const prediction = await service.submitPrediction(
      'observer-1',
      'pr-1',
      'merge',
      fakeClient,
      25,
    );
    expect(prediction.predictedOutcome).toBe('merge');
    expect(prediction.stakePoints).toBe(25);

    const summary = await service.getPredictionSummary(
      'observer-1',
      'pr-1',
      fakeClient,
    );
    expect(summary.pullRequestStatus).toBe('pending');
    expect(summary.consensus).toEqual({ merge: 2, reject: 1, total: 3 });
    expect(summary.observerPrediction?.predictedOutcome).toBe('merge');
    expect(summary.market).toEqual({
      minStakePoints: 5,
      maxStakePoints: 220,
      mergeStakePoints: 45,
      rejectStakePoints: 20,
      totalStakePoints: 65,
      mergeOdds: 0.69,
      rejectOdds: 0.31,
      mergePayoutMultiplier: 1.44,
      rejectPayoutMultiplier: 3.25,
      observerNetPoints: 18,
      trustTier: 'regular',
      dailyStakeCapPoints: 1000,
      dailyStakeUsedPoints: 140,
      dailySubmissionCap: 30,
      dailySubmissionsUsed: 4,
    });
    expect(summary.accuracy).toEqual({ correct: 3, total: 5, rate: 0.6 });
  });

  test('blocks prediction updates after resolution', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'pred-1', resolved_at: new Date().toISOString() }],
        }),
    } as any;

    await expect(
      service.submitPrediction('observer-1', 'pr-1', 'reject', fakeClient),
    ).rejects.toMatchObject({
      code: 'PREDICTION_RESOLVED',
    });
  });

  test('returns existing prediction for idempotent submit payload', async () => {
    const now = new Date().toISOString();
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'pred-1',
              observer_id: 'observer-1',
              pull_request_id: 'pr-1',
              predicted_outcome: 'merge',
              stake_points: 20,
              payout_points: 0,
              resolved_outcome: null,
              is_correct: null,
              created_at: now,
              resolved_at: null,
              created_today: true,
            },
          ],
        }),
    } as any;

    const prediction = await service.submitPrediction(
      'observer-1',
      'pr-1',
      'merge',
      fakeClient,
      20,
    );

    expect(prediction).toEqual(
      expect.objectContaining({
        id: 'pred-1',
        observerId: 'observer-1',
        pullRequestId: 'pr-1',
        predictedOutcome: 'merge',
        stakePoints: 20,
      }),
    );
    expect(fakeClient.query).toHaveBeenCalledTimes(3);
  });

  test('treats conflict update on resolved prediction as resolved', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'pred-1',
              observer_id: 'observer-1',
              pull_request_id: 'pr-1',
              predicted_outcome: 'merge',
              stake_points: 20,
              payout_points: 0,
              resolved_outcome: null,
              is_correct: null,
              created_at: new Date().toISOString(),
              resolved_at: null,
              created_today: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ resolved_count: 20, correct_count: 12 }],
        })
        .mockResolvedValueOnce({
          rows: [{ submission_count: 3, stake_points: 90 }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    await expect(
      service.submitPrediction('observer-1', 'pr-1', 'reject', fakeClient, 30),
    ).rejects.toMatchObject({
      code: 'PREDICTION_RESOLVED',
    });
  });

  test('enforces trust-tier stake limits for new predictors', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ resolved_count: 0, correct_count: 0 }],
        }),
    } as any;

    await expect(
      service.submitPrediction('observer-1', 'pr-1', 'merge', fakeClient, 200),
    ).rejects.toMatchObject({
      code: 'PREDICTION_STAKE_LIMIT_EXCEEDED',
    });
  });

  test('enforces daily prediction submission cap', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ resolved_count: 120, correct_count: 84 }],
        })
        .mockResolvedValueOnce({
          rows: [{ submission_count: 30, stake_points: 600 }],
        }),
    } as any;

    await expect(
      service.submitPrediction('observer-1', 'pr-1', 'merge', fakeClient, 40),
    ).rejects.toMatchObject({
      code: 'PREDICTION_DAILY_SUBMISSION_CAP_REACHED',
    });
  });

  test('enforces daily stake cap', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'observer-1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ resolved_count: 120, correct_count: 84 }],
        })
        .mockResolvedValueOnce({
          rows: [{ submission_count: 5, stake_points: 990 }],
        }),
    } as any;

    await expect(
      service.submitPrediction('observer-1', 'pr-1', 'merge', fakeClient, 20),
    ).rejects.toMatchObject({
      code: 'PREDICTION_DAILY_STAKE_CAP_REACHED',
    });
  });
});
