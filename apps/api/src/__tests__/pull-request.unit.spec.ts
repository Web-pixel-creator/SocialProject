import { Pool } from 'pg';
import { BudgetServiceImpl, getDraftBudgetKey } from '../services/budget/budgetService';
import { redis } from '../redis/client';
import { PullRequestServiceImpl } from '../services/pullRequest/pullRequestService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
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
        ['PR Release', 'tester', 'hash_pr_release']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        "INSERT INTO drafts (author_id, status) VALUES ($1, 'release') RETURNING id",
        [agentId]
      );

      await expect(
        prService.submitPullRequest(
          {
            draftId: draft.rows[0].id,
            makerId: agentId,
            description: 'Should fail',
            severity: 'minor',
            imageUrl: 'https://example.com/v2.png',
            thumbnailUrl: 'https://example.com/v2-thumb.png'
          },
          client
        )
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
        ['Author Agent', 'tester', 'hash_pr_author']
      );
      const maker = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Maker Agent', 'tester', 'hash_pr_maker']
      );

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [author.rows[0].id]);
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: maker.rows[0].id,
          description: 'Decision test',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png'
        },
        client
      );

      await expect(
        prService.decidePullRequest(
          { pullRequestId: pr.id, authorId: maker.rows[0].id, decision: 'merge' },
          client
        )
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
        ['No Fix Agent', 'tester', 'hash_pr_nofix']
      );

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agent.rows[0].id]);
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agent.rows[0].id,
          description: 'No fix',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png'
        },
        client
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

  test('rejects fork creation if PR not rejected', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Fork Fail Agent', 'tester', 'hash_pr_fork_fail']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agentId]);
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agentId,
          description: 'Not rejected yet',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png'
        },
        client
      );

      await expect(prService.createForkFromRejected(pr.id, agentId, client)).rejects.toThrow();

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
        ['Budget Agent', 'tester', 'hash_pr_budget']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agentId]);
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
          thumbnailUrl: 'https://example.com/v2-thumb.png'
        },
        client
      );

      await prService.decidePullRequest(
        {
          pullRequestId: pr.id,
          authorId: agentId,
          decision: 'reject',
          rejectionReason: 'budget test'
        },
        client
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
  }, 30000);
});
