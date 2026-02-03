import { Pool } from 'pg';
import fc from 'fast-check';
import { PullRequestServiceImpl } from '../services/pullRequest/pullRequestService';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finishit'
});

const prService = new PullRequestServiceImpl(pool);

describe('pull request properties', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('Property 4: Version Increment on PR Submission', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('major', 'minor'), async (severity) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const agent = await client.query(
            'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
            ['PR Agent', 'tester', 'hash_pr_1']
          );
          const agentId = agent.rows[0].id;

          const draft = await client.query(
            'INSERT INTO drafts (author_id, current_version) VALUES ($1, $2) RETURNING id, current_version',
            [agentId, 1]
          );

          const pr = await prService.submitPullRequest(
            {
              draftId: draft.rows[0].id,
              makerId: agentId,
              description: 'New version',
              severity,
              imageUrl: 'https://example.com/v2.png',
              thumbnailUrl: 'https://example.com/v2-thumb.png'
            },
            client
          );

          expect(pr.proposedVersion).toBeGreaterThan(draft.rows[0].current_version);

          await client.query('ROLLBACK');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }),
      { numRuns: 10 }
    );
  }, 30000);

  test('Property 42: PR Default Status', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['PR Status', 'tester', 'hash_pr_2']
      );

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agent.rows[0].id]);

      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agent.rows[0].id,
          description: 'Pending',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png'
        },
        client
      );

      expect(pr.status).toBe('pending');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 5: Merge Updates Draft Version', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['PR Merge', 'tester', 'hash_pr_3']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        'INSERT INTO drafts (author_id, current_version) VALUES ($1, $2) RETURNING id, current_version',
        [agentId, 1]
      );

      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agentId,
          description: 'Merge me',
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
          decision: 'merge'
        },
        client
      );

      const updatedDraft = await client.query('SELECT current_version FROM drafts WHERE id = $1', [draft.rows[0].id]);
      expect(Number(updatedDraft.rows[0].current_version)).toBe(pr.proposedVersion);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 40: PR Version Storage', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['PR Storage', 'tester', 'hash_pr_4']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agentId]);
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agentId,
          description: 'Store version',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png'
        },
        client
      );

      const version = await client.query(
        'SELECT version_number, image_url FROM versions WHERE pull_request_id = $1',
        [pr.id]
      );

      expect(Number(version.rows[0].version_number)).toBe(pr.proposedVersion);
      expect(version.rows[0].image_url).toContain('example.com');

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('Property 46: PR Required Fields', async () => {
    await expect(
      prService.submitPullRequest({
        draftId: '',
        makerId: '',
        description: '',
        severity: 'minor',
        imageUrl: '',
        thumbnailUrl: ''
      })
    ).rejects.toThrow();
  });

  test('Property 47: Rejection Reason Required', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['PR Reject', 'tester', 'hash_pr_5']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agentId]);
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agentId,
          description: 'Reject me',
          severity: 'minor',
          imageUrl: 'https://example.com/v2.png',
          thumbnailUrl: 'https://example.com/v2-thumb.png'
        },
        client
      );

      await expect(
        prService.decidePullRequest(
          {
            pullRequestId: pr.id,
            authorId: agentId,
            decision: 'reject'
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

  test('Property 24: Fork Creation from Rejection', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Fork Agent', 'tester', 'hash_pr_6']
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query('INSERT INTO drafts (author_id) VALUES ($1) RETURNING id', [agentId]);
      const pr = await prService.submitPullRequest(
        {
          draftId: draft.rows[0].id,
          makerId: agentId,
          description: 'Fork me',
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
          rejectionReason: 'nope'
        },
        client
      );

      const fork = await prService.createForkFromRejected(pr.id, agentId, client);
      expect(fork.forkedDraftId).toBeTruthy();

      const forkDraft = await client.query('SELECT author_id FROM drafts WHERE id = $1', [fork.forkedDraftId]);
      expect(forkDraft.rows[0].author_id).toBe(agentId);

      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
