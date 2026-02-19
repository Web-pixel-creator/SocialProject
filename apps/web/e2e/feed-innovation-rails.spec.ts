import { expect, test } from '@playwright/test';
import { FEED_PATH } from './utils/feed';
import { navigateWithRetry } from './utils/navigation';

const json = (body: unknown, status = 200) => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  status,
});

interface RailMockOptions {
  failCreatorStudios?: boolean;
  failLiveSessions?: boolean;
  failSwarms?: boolean;
}

const installInnovationRailMocks = async (
  page: Parameters<typeof test>[0]['page'],
  options: RailMockOptions = {},
) => {
  const {
    failCreatorStudios = false,
    failLiveSessions = false,
    failSwarms = false,
  } = options;

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const method = route.request().method();
    const path = requestUrl.pathname;

    if (method === 'POST' && path === '/api/telemetry/ux') {
      return route.fulfill(json({ ok: true }));
    }

    if (method === 'GET' && path === '/api/feed') {
      return route.fulfill(json([]));
    }

    if (
      method === 'GET' &&
      [
        '/api/feeds/battles',
        '/api/feeds/glowups',
        '/api/feeds/studios',
        '/api/feeds/live-drafts',
        '/api/feeds/hot-now',
        '/api/feeds/changes',
        '/api/me/following',
      ].includes(path)
    ) {
      return route.fulfill(json([]));
    }

    if (method === 'GET' && path === '/api/live-sessions') {
      if (failLiveSessions) {
        return route.fulfill(json({ error: 'LIVE_SESSIONS_UNAVAILABLE' }, 500));
      }
      return route.fulfill(
        json([
          {
            id: 'live-e2e-1',
            title: 'Neon Sprint',
            objective: 'Resolve final typography blockers before merge',
            status: 'completed',
            participantCount: 14,
            messageCount: 11,
            lastActivityAt: '2026-02-19T12:30:00.000Z',
          },
        ]),
      );
    }

    if (method === 'GET' && path === '/api/live-sessions/live-e2e-1') {
      if (failLiveSessions) {
        return route.fulfill(json({ error: 'LIVE_SESSION_NOT_FOUND' }, 404));
      }
      return route.fulfill(
        json({
          session: {
            id: 'live-e2e-1',
            recapSummary:
              'Host recap: merged after final spacing pass and copy cleanup.',
            recapClipUrl: 'https://cdn.example.com/live-e2e-1.mp4',
          },
          presence: [
            { participantType: 'human' },
            { participantType: 'human' },
            { participantType: 'agent' },
          ],
          messages: [
            { content: 'merge this pass, ship it' },
            { content: 'reject if mobile spacing regresses' },
            { content: 'approve after hero fixes' },
          ],
        }),
      );
    }

    if (method === 'GET' && path === '/api/swarms') {
      if (failSwarms) {
        return route.fulfill(json({ error: 'SWARMS_UNAVAILABLE' }, 500));
      }
      return route.fulfill(
        json([
          {
            id: 'swarm-e2e-1',
            title: 'Launch Strike Team',
            objective: 'Run colorist and storyteller passes in parallel',
            status: 'active',
            memberCount: 3,
            judgeEventCount: 2,
            lastActivityAt: '2026-02-19T12:40:00.000Z',
          },
        ]),
      );
    }

    if (method === 'GET' && path === '/api/swarms/swarm-e2e-1') {
      if (failSwarms) {
        return route.fulfill(json({ error: 'SWARM_NOT_FOUND' }, 404));
      }
      return route.fulfill(
        json({
          judgeEvents: [
            {
              id: 'judge-e2e-1',
              eventType: 'checkpoint',
              score: 82,
              notes: 'Color pass stabilized contrast and palette consistency.',
            },
            {
              id: 'judge-e2e-2',
              eventType: 'decision',
              score: 86,
              notes: 'Story pacing now aligns with release quality bar.',
            },
          ],
        }),
      );
    }

    if (method === 'GET' && path === '/api/creator-studios') {
      if (failCreatorStudios) {
        return route.fulfill(
          json({ error: 'CREATOR_STUDIOS_UNAVAILABLE' }, 500),
        );
      }
      return route.fulfill(
        json([
          {
            id: 'creator-e2e-1',
            studioName: 'Signal Forge',
            tagline: 'Human-led system prompts for clean release arcs',
            status: 'active',
            revenueSharePercent: 20,
            retentionScore: 78,
          },
        ]),
      );
    }

    return route.fulfill(json({}));
  });
};

const waitForFeedReady = async (page: Parameters<typeof test>[0]['page']) => {
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get(FEED_PATH, { timeout: 5_000 });
          return response.status();
        } catch {
          return 0;
        }
      },
      { timeout: 120_000 },
    )
    .toBe(200);
};

const openInnovationFeed = async (page: Parameters<typeof test>[0]['page']) => {
  await waitForFeedReady(page);
  await navigateWithRetry(page, FEED_PATH, {
    attempts: 5,
    gotoOptions: { timeout: 60_000, waitUntil: 'domcontentloaded' },
    retryDelayMs: 500,
  });
};

test.describe('Feed innovation rails', () => {
  test.describe.configure({ timeout: 180_000 });

  test('renders live sessions, swarm sessions, and creator toolkit with API data', async ({
    page,
  }) => {
    await installInnovationRailMocks(page);
    await openInnovationFeed(page);

    const liveRail = page.getByTestId('live-studio-sessions-rail');
    await expect(liveRail).toBeVisible();
    await expect(liveRail.getByText(/Neon Sprint/i)).toBeVisible();
    await expect(liveRail.getByText(/Prediction signal: Merge/i)).toBeVisible();
    await expect(liveRail.getByText(/Host recap:/i)).toBeVisible();
    await expect(liveRail.getByRole('link', { name: /Open recap clip/i })).toHaveAttribute(
      'href',
      'https://cdn.example.com/live-e2e-1.mp4',
    );

    const swarmRail = page.getByTestId('swarm-sessions-rail');
    await expect(swarmRail).toBeVisible();
    await expect(swarmRail.getByText(/Launch Strike Team/i)).toBeVisible();
    await expect(swarmRail.getByText(/Replay timeline/i)).toBeVisible();
    await expect(
      swarmRail.getByText(/Color pass stabilized contrast/i),
    ).toBeVisible();

    const creatorRail = page.getByTestId('creator-studios-rail');
    await expect(creatorRail).toBeVisible();
    await expect(creatorRail.getByText(/Signal Forge/i)).toBeVisible();
    await expect(creatorRail.getByText(/Share 20%/i)).toBeVisible();
    await expect(creatorRail.getByText(/Retention 78/i)).toBeVisible();
  });

  test('shows seeded fallback cards when innovation endpoints fail', async ({
    page,
  }) => {
    await installInnovationRailMocks(page, {
      failCreatorStudios: true,
      failLiveSessions: true,
      failSwarms: true,
    });
    await openInnovationFeed(page);

    await expect(
      page
        .getByTestId('live-studio-sessions-rail')
        .getByText(/Prompt Surgery Live/i),
    ).toBeVisible();
    await expect(
      page.getByTestId('swarm-sessions-rail').getByText(/Creative strike team/i),
    ).toBeVisible();
    await expect(
      page.getByTestId('creator-studios-rail').getByText(/Prompt Forge/i),
    ).toBeVisible();
  });
});
