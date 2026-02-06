import { Pool } from 'pg';
import { FeedServiceImpl } from '../services/feed/feedService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

const feedService = new FeedServiceImpl(pool);

describe('feed service edge cases', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('handles empty feeds', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = await feedService.getGlowUps({ limit: 5 }, client);
      expect(Array.isArray(results)).toBe(true);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('pagination boundaries', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Page Agent', 'tester', 'hash_feed_page'],
      );
      const agentId = agent.rows[0].id;

      for (let i = 0; i < 3; i += 1) {
        await client.query(
          'INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)',
          [agentId, i],
        );
      }

      const page = await feedService.getGlowUps(
        { limit: 2, offset: 1 },
        client,
      );
      expect(page.length).toBe(2);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('for you feed falls back without history', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Fallback Agent', 'tester', 'hash_feed_fallback'],
      );

      await client.query(
        'INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)',
        [agent.rows[0].id, 9],
      );

      const results = await feedService.getForYou(
        { userId: '00000000-0000-0000-0000-000000000000' },
        client,
      );
      expect(results.length).toBeGreaterThan(0);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('feed ordering consistent', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Order Agent', 'tester', 'hash_feed_order'],
      );

      await client.query(
        'INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)',
        [agent.rows[0].id, 1],
      );
      await client.query(
        'INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2)',
        [agent.rows[0].id, 5],
      );

      const results = await feedService.getGlowUps({}, client);
      expect(results[0].glowUpScore).toBeGreaterThanOrEqual(
        results[1].glowUpScore,
      );

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('unified feed filters by status and pending PRs', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash, impact) VALUES ($1, $2, $3, $4) RETURNING id',
        ['Filter Agent', 'tester', 'hash_feed_filter', 3],
      );
      const agentId = agent.rows[0].id;

      const draft = await client.query(
        "INSERT INTO drafts (author_id, status, glow_up_score) VALUES ($1, 'draft', 1) RETURNING id",
        [agentId],
      );
      const release = await client.query(
        "INSERT INTO drafts (author_id, status, glow_up_score) VALUES ($1, 'release', 2) RETURNING id",
        [agentId],
      );
      const prDraft = await client.query(
        "INSERT INTO drafts (author_id, status, glow_up_score) VALUES ($1, 'draft', 3) RETURNING id",
        [agentId],
      );
      await client.query(
        `INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status)
         VALUES ($1, $2, 2, 'Pending PR', 'minor', 'pending')`,
        [prDraft.rows[0].id, agentId],
      );

      const releaseItems = await feedService.getFeed(
        { status: 'release' },
        client,
      );
      expect(releaseItems.every((item) => item.type === 'release')).toBe(true);

      const prItems = await feedService.getFeed({ status: 'pr' }, client);
      expect(
        prItems.find((item) => item.id === prDraft.rows[0].id),
      ).toBeTruthy();
      expect(
        prItems.find((item) => item.id === release.rows[0].id),
      ).toBeFalsy();
      expect(prItems.find((item) => item.id === draft.rows[0].id)).toBeFalsy();

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('unified feed sorts by glowup and impact', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lowImpactAgent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash, impact) VALUES ($1, $2, $3, $4) RETURNING id',
        ['Low Impact', 'tester', 'hash_feed_low', 1],
      );
      const highImpactAgent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash, impact) VALUES ($1, $2, $3, $4) RETURNING id',
        ['High Impact', 'tester', 'hash_feed_high', 50],
      );

      const _lowDraft = await client.query(
        "INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, $2, NOW() - INTERVAL '1 day') RETURNING id",
        [lowImpactAgent.rows[0].id, 2],
      );
      const highDraft = await client.query(
        'INSERT INTO drafts (author_id, glow_up_score, updated_at) VALUES ($1, $2, NOW()) RETURNING id',
        [highImpactAgent.rows[0].id, 5],
      );

      const glowupItems = await feedService.getFeed({ sort: 'glowup' }, client);
      expect(glowupItems[0].glowUpScore).toBeGreaterThanOrEqual(
        glowupItems[1].glowUpScore,
      );

      const impactItems = await feedService.getFeed({ sort: 'impact' }, client);
      expect(impactItems[0].id).toBe(highDraft.rows[0].id);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('for you feed uses viewing history when present', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        'INSERT INTO users (email, password_hash, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at) VALUES ($1, $2, $3, NOW(), $4, NOW()) RETURNING id',
        ['viewer@example.com', 'hash', 'v1', 'v1'],
      );
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Viewer Agent', 'tester', 'hash_feed_view'],
      );

      const draft = await client.query(
        'INSERT INTO drafts (author_id, glow_up_score) VALUES ($1, $2) RETURNING id',
        [agent.rows[0].id, 7],
      );
      await client.query(
        'INSERT INTO viewing_history (user_id, draft_id) VALUES ($1, $2)',
        [user.rows[0].id, draft.rows[0].id],
      );

      const results = await feedService.getForYou(
        { userId: user.rows[0].id },
        client,
      );
      expect(results[0].id).toBe(draft.rows[0].id);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('live drafts and studios queries return arrays', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Live Agent', 'tester', 'hash_live_agent'],
      );
      await client.query(
        "INSERT INTO drafts (author_id, status, updated_at, glow_up_score) VALUES ($1, 'draft', NOW(), 2)",
        [agent.rows[0].id],
      );

      const live = await feedService.getLiveDrafts({}, client);
      const studios = await feedService.getStudios({}, client);

      expect(Array.isArray(live)).toBe(true);
      expect(Array.isArray(studios)).toBe(true);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('battles and archive return items', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const agent = await client.query(
        'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
        ['Battle Agent', 'tester', 'hash_battle'],
      );
      const draft = await client.query(
        "INSERT INTO drafts (author_id, status, glow_up_score, created_at, updated_at) VALUES ($1, 'release', 3, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day') RETURNING id",
        [agent.rows[0].id],
      );
      await client.query(
        `INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status)
         VALUES ($1, $2, 2, 'One', 'minor', 'pending')`,
        [draft.rows[0].id, agent.rows[0].id],
      );
      await client.query(
        `INSERT INTO pull_requests (draft_id, maker_id, proposed_version, description, severity, status)
         VALUES ($1, $2, 3, 'Two', 'minor', 'pending')`,
        [draft.rows[0].id, agent.rows[0].id],
      );
      await client.query(
        'INSERT INTO autopsy_reports (share_slug, summary, data, published_at) VALUES ($1, $2, $3, NOW())',
        ['auto-1', 'Summary', '{}'],
      );

      const battles = await feedService.getBattles({}, client);
      const archive = await feedService.getArchive({}, client);

      expect(battles.length).toBeGreaterThan(0);
      expect(archive.length).toBeGreaterThan(0);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  test('maps missing values in feed items', async () => {
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'draft-null',
            status: 'draft',
            glow_up_score: null,
            updated_at: '2026-02-03T00:00:00.000Z',
          },
        ],
      }),
    };

    const results = await feedService.getGlowUps({}, fakeClient as any);
    expect(results[0].glowUpScore).toBe(0);
  });

  test('archive uses created_at when published_at is null', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'auto-null',
              summary: 'No publish date',
              created_at: '2026-02-01T00:00:00.000Z',
              published_at: null,
            },
          ],
        }),
    };

    const results = await feedService.getArchive({}, fakeClient as any);
    expect(results[0].updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  test('maps missing studio metrics to zero', async () => {
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'studio-null',
            studio_name: 'Null Studio',
            impact: null,
            signal: null,
          },
        ],
      }),
    };

    const results = await feedService.getStudios({}, fakeClient as any);
    expect(results[0].impact).toBe(0);
    expect(results[0].signal).toBe(0);
  });

  test('progress feed ranks items by score', async () => {
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            draft_id: 'draft-a',
            before_image_url: 'before-a.png',
            after_image_url: 'after-a.png',
            glow_up_score: 5,
            pr_count: 1,
            last_activity: new Date().toISOString(),
            studio_name: 'Studio A',
            guild_id: null,
          },
          {
            draft_id: 'draft-b',
            before_image_url: 'before-b.png',
            after_image_url: 'after-b.png',
            glow_up_score: 20,
            pr_count: 0,
            last_activity: new Date(
              Date.now() - 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            studio_name: 'Studio B',
            guild_id: null,
          },
        ],
      }),
    };

    const results = await feedService.getProgress(
      { limit: 2 },
      fakeClient as any,
    );
    expect(results.length).toBe(2);
    expect(results[0].draftId).toBe('draft-b');
  });

  test('hot now feed ranks drafts and includes reason labels', async () => {
    const now = new Date().toISOString();
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            draft_id: 'hot-a',
            draft_title: 'Hot A',
            glow_up_score: 2,
            fix_open_count: 1,
            pr_pending_count: 0,
            decisions_24h: 0,
            merges_24h: 0,
            merged_major_total: 0,
            merged_minor_total: 0,
            merged_major_24h: 0,
            merged_minor_24h: 0,
            last_activity: now,
            updated_at: now,
          },
          {
            draft_id: 'hot-b',
            draft_title: 'Hot B',
            glow_up_score: 3,
            fix_open_count: 0,
            pr_pending_count: 2,
            decisions_24h: 1,
            merges_24h: 1,
            merged_major_total: 1,
            merged_minor_total: 0,
            merged_major_24h: 1,
            merged_minor_24h: 0,
            last_activity: now,
            updated_at: now,
          },
        ],
      }),
    };

    const results = await feedService.getHotNow(
      { limit: 2 },
      fakeClient as any,
    );
    expect(results).toHaveLength(2);
    expect(results[0].draftId).toBe('hot-b');
    expect(results[0].reasonLabel).toContain('2 PR pending');
    expect(results[0].reasonLabel).toContain('1 merge in 24h');
  });

  test('hot now feed falls back to low activity reason', async () => {
    const now = new Date().toISOString();
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            draft_id: 'hot-c',
            draft_title: 'Hot C',
            glow_up_score: 0,
            fix_open_count: 0,
            pr_pending_count: 0,
            decisions_24h: 0,
            merges_24h: 0,
            merged_major_total: 0,
            merged_minor_total: 0,
            merged_major_24h: 0,
            merged_minor_24h: 0,
            last_activity: now,
            updated_at: now,
          },
        ],
      }),
    };

    const results = await feedService.getHotNow(
      { limit: 1 },
      fakeClient as any,
    );
    expect(results[0].reasonLabel).toBe('Low activity');
  });
});
