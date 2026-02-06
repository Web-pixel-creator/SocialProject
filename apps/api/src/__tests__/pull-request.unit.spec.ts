import { Pool } from 'pg';
import { redis } from '../redis/client';
import {
  BudgetServiceImpl,
  getDraftBudgetKey,
} from '../services/budget/budgetService';
import { PullRequestServiceImpl } from '../services/pullRequest/pullRequestService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const prService = new PullRequestServiceImpl(pool);

describe('pull request edge cases', () => {
  beforeAll(async () => {
    if (!redis.isOpen) {
      await redis.connect();
    }
  });

  afterAll(async () => {
    if (redis.isOpen) {
      await redis.quit();
    }
    await pool.end();
  });

  test('rejects PR on released draft', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['PR Release', 'tester', 'hash_pr_release'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        "INSERT INTO drafts (author_id, status) VALUES ($1, 'release') RETURNING id",
        [agentId],
      );

      await expect(
        prService.submitPullRequest(
          {
            draftId: draft.rows[0].id,
            makerId: agentId,
            description: 'Should fail',
            severity: 'minor',
            imageUrl: 'https://example.com/v2.png',
            thumbnailUrl: 'https://example.com/v2-thumb.png',
          },
          client,
        ),
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects decision by non-author', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const author = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Author Agent', 'tester', 'hash_pr_author'],
      );
      const maker = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Maker Agent', 'tester', 'hash_pr_maker'],
      );

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [author.rows[0].id],
      );
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: maker.rows[0].id,
          description: 'Decision test',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png',
        },
        client,
      );

      await expect(
        prService.decidePullRequest(
          {
            pullRequestId: pr.id,
            authorId: maker.rows[0].id,
            decision: 'merge',
          },
          client,
        ),
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('allows PR without fix requests', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['No Fix Agent', 'tester', 'hash_pr_nofix'],
      );

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agent.rows[0].id],
      );
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agent.rows[0].id,
          description: 'No fix',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png',
        },
        client,
      );

      expect(pr.addressedFixRequests.length).toBe(0);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects invalid severity values', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Invalid Severity Agent', 'tester', 'hash_pr_invalid'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );

      await expect(
        prService.submitPullRequest(
          {
            draftId: draft.rows[0].id,
            makerId: agentId,
            description: 'Bad severity',
            severity: 'invalid' as any,
            imageUrl: 'https://example.com/v2.png',
            thumbnailUrl: 'https://example.com/v2-thumb.png',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'PR_INVALID_SEVERITY' });

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects PR when draft is missing', async () => {
    await expect(
      prService.submitPullRequest({
        draftId: '00000000-0000-0000-0000-000000000000',
        makerId: '00000000-0000-0000-0000-000000000000',
        description: 'Missing draft',
        severity: 'minor',
        imageUrl: 'https://example.com/v2.png',
        thumbnailUrl: 'https://example.com/v2-thumb.png',
      }),
    ).rejects.toMatchObject({ code: 'DRAFT_NOT_FOUND' });
  });

  test('decidePullRequest rejects missing pull requests', async () => {
    await expect(
      prService.decidePullRequest({
        pullRequestId: '00000000-0000-0000-0000-000000000000',
        authorId: '00000000-0000-0000-0000-000000000000',
        decision: 'merge',
      }),
    ).rejects.toMatchObject({ code: 'PR_NOT_FOUND' });
  });

  test('rejects fork creation if PR not rejected', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Fork Fail Agent', 'tester', 'hash_pr_fork_fail'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agentId,
          description: 'Not rejected yet',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png',
        },
        client,
      );

      await expect(
        prService.createForkFromRejected(pr.id, agentId, client),
      ).rejects.toThrow();

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects fork creation when PR is missing', async () => {
    await expect(
      prService.createForkFromRejected(
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000000',
      ),
    ).rejects.toMatchObject({ code: 'PR_NOT_FOUND' });
  });

  test('rejects fork creation for non-maker', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const maker = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Maker One', 'tester', 'hash_pr_maker_one'],
      );
      const intruder = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Maker Two', 'tester', 'hash_pr_maker_two'],
      );

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [maker.rows[0].id],
      );
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: maker.rows[0].id,
          description: 'Reject me',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png',
        },
        client,
      );

      await prService.decidePullRequest(
        {
          pullRequestId: pr.id,
          authorId: maker.rows[0].id,
          decision: 'reject',
          rejectionReason: 'not now',
        },
        client,
      );

      await expect(
        prService.createForkFromRejected(pr.id, intruder.rows[0].id, client),
      ).rejects.toMatchObject({
        code: 'NOT_MAKER',
      });

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('rejects fork creation when version is missing', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Missing Version Agent', 'tester', 'hash_pr_missing_version'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );
      const pr = await client.query(
        "INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status) VALUES ($1, $2, $3, $4, $5, 'rejected') RETURNING id",
        [draft.rows[0].id, agentId, 2, 'Manual PR', 'minor'],
      );

      await expect(
        prService.createForkFromRejected(pr.rows[0].id, agentId, client),
      ).rejects.toMatchObject({
        code: 'PR_VERSION_NOT_FOUND',
      });

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('parses addressed fix requests from strings', async () => {
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'pr-1',
            draft_id: 'draft-1',
            maker_id: 'maker-1',
            proposed_version: 2,
            description: 'Test',
            severity: 'minor',
            status: 'pending',
            addressed_fix_requests: '["fix-1","fix-2"]',
            author_feedback: null,
            judge_verdict: null,
            created_at: new Date(),
            decided_at: null,
          },
          {
            id: 'pr-2',
            draft_id: 'draft-1',
            maker_id: 'maker-1',
            proposed_version: 3,
            description: 'Bad JSON',
            severity: 'minor',
            status: 'pending',
            addressed_fix_requests: 'not-json',
            author_feedback: null,
            judge_verdict: null,
            created_at: new Date(),
            decided_at: null,
          },
        ],
      }),
    };

    const list = await prService.listByDraft('draft-1', fakeClient as any);
    expect(list[0].addressedFixRequests).toEqual(['fix-1', 'fix-2']);
    expect(list[1].addressedFixRequests).toEqual([]);
  });

  test('getDraftStatus returns status or throws', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Status Agent', 'tester', 'hash_pr_status'],
      );
      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agent.rows[0].id],
      );

      const status = await prService.getDraftStatus(draft.rows[0].id, client);
      expect(status).toBe('draft');

      await expect(
        prService.getDraftStatus(
          '00000000-0000-0000-0000-000000000000',
          client,
        ),
      ).rejects.toMatchObject({
        code: 'DRAFT_NOT_FOUND',
      });

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('fork does not affect original budget counters', async () => {
    const client = await pool.connect();
    const budgetService = new BudgetServiceImpl();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Budget Agent', 'tester', 'hash_pr_budget'],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id) VALUES ($1) RETURNING id',
        [agentId],
      );
      const budgetKey = getDraftBudgetKey(draft.rows[0].id, new Date());
      await redis.del(budgetKey);

      await budgetService.incrementEditBudget(draft.rows[0].id, 'pr');

      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agentId,
          description: 'Budget fork',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png',
        },
        client,
      );

      await prService.decidePullRequest(
        {
          pullRequestId: pr.id,
          authorId: agentId,
          decision: 'reject',
          rejectionReason: 'budget test',
        },
        client,
      );

      await prService.createForkFromRejected(pr.id, agentId, client);

      const budget = await budgetService.getEditBudget(draft.rows[0].id);
      expect(budget.pr).toBe(1);

      await redis.del(budgetKey);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }, 30_000);
});
