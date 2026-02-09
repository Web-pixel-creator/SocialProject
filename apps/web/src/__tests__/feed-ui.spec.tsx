/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { DraftCard } from '../components/DraftCard';
import { endpointForTab, FeedTabs } from '../components/FeedTabs';
import { apiClient } from '../lib/api';

let searchParams = new URLSearchParams('');
const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/feed',
  useSearchParams: () => searchParams,
}));
jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
  setAuthToken: jest.fn(),
}));

const flushAsync = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const renderFeedTabs = async () => {
  await act(async () => {
    render(<FeedTabs />);
    await flushAsync();
  });
};

const clickAndFlush = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
    await flushAsync();
  });
};

const scrollAndFlush = async () => {
  await act(async () => {
    fireEvent.scroll(window);
    await flushAsync();
  });
};

const changeAndFlush = async (element: HTMLElement, value: string) => {
  await act(async () => {
    fireEvent.change(element, { target: { value } });
    await flushAsync();
  });
};
describe('feed UI', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });
    replaceMock.mockReset();
    searchParams = new URLSearchParams('');
  });

  afterEach(async () => {
    await act(async () => {
      await flushAsync();
    });
  });

  test('renders draft card', () => {
    render(
      <DraftCard glowUpScore={3.2} id="draft-1" live title="Test Draft" />,
    );
    expect(screen.getByText(/Test Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });

  test('switches tabs', async () => {
    await renderFeedTabs();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    const tab = screen.getByRole('button', { name: /GlowUps/i });
    await clickAndFlush(tab);
    expect(tab).toHaveClass('bg-ink');
  });

  test('falls back when for-you feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('for-you failed'))
      .mockResolvedValueOnce({ data: [] });

    await renderFeedTabs();

    const forYouTab = screen.getByRole('button', { name: /For You/i });
    await clickAndFlush(forYouTab);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
  });

  test('renders archive autopsy items', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'auto-1',
            summary: 'Autopsy summary',
            publishedAt: new Date().toISOString(),
          },
        ],
      });

    await renderFeedTabs();

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await clickAndFlush(archiveTab);

    await waitFor(() =>
      expect(screen.getByText(/Autopsy summary/i)).toBeInTheDocument(),
    );
  });

  test('renders studio cards', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          { id: 'studio-9', studioName: 'Studio Nine', impact: 10, signal: 5 },
        ],
      });

    await renderFeedTabs();

    const studiosTab = screen.getByRole('button', { name: /Studios/i });
    await clickAndFlush(studiosTab);

    await waitFor(() =>
      expect(screen.getByText(/Studio Nine/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Impact 10.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal 5.0/i)).toBeInTheDocument();
  });

  test('falls back to glowups endpoint for unknown tab', () => {
    expect(endpointForTab('Unknown')).toBe('/feeds/glowups');
  });

  test('uses progress endpoint for progress tab', () => {
    expect(endpointForTab('Progress')).toBe('/feeds/progress');
  });

  test('uses changes endpoint for changes tab', () => {
    expect(endpointForTab('Changes')).toBe('/feeds/changes');
  });

  test('uses hot-now endpoint for hot now tab', () => {
    expect(endpointForTab('Hot Now')).toBe('/feeds/hot-now');
  });

  test('uses unified feed endpoint for all tab', () => {
    expect(endpointForTab('All')).toBe('/feed');
  });

  test('uses guilds endpoint for guilds tab', () => {
    expect(endpointForTab('Guilds')).toBe('/guilds');
  });

  test('requests battles feed endpoint', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });

    await renderFeedTabs();

    const battlesTab = screen.getByRole('button', { name: /Battles/i });
    await clickAndFlush(battlesTab);

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/feeds/battles',
        expect.anything(),
      ),
    );
  });

  test('renders progress cards', async () => {
    const progressPayload = [
      {
        draftId: 'draft-progress',
        beforeImageUrl: 'before.png',
        afterImageUrl: 'after.png',
        glowUpScore: 9.4,
        prCount: 2,
        lastActivity: new Date().toISOString(),
        authorStudio: 'Progress Studio',
      },
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: progressPayload });

    await renderFeedTabs();

    const progressTab = screen.getByRole('button', { name: /Progress/i });
    await clickAndFlush(progressTab);

    await waitFor(() =>
      expect(screen.getByText(/Before \/ After/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/GlowUp 9.4/i)).toBeInTheDocument();
    expect(screen.getByText(/PRs: 2/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open detail/i })).toHaveAttribute(
      'href',
      '/drafts/draft-progress',
    );
  });

  test('sends telemetry when opening progress detail card', async () => {
    const progressPayload = [
      {
        draftId: 'draft-progress-telemetry',
        beforeImageUrl: 'before.png',
        afterImageUrl: 'after.png',
        glowUpScore: 9.4,
        prCount: 2,
        lastActivity: new Date().toISOString(),
        authorStudio: 'Progress Studio',
      },
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: progressPayload });

    await renderFeedTabs();
    const progressTab = screen.getByRole('button', { name: /Progress/i });
    await clickAndFlush(progressTab);
    const detailLink = await screen.findByRole('link', {
      name: /Open detail/i,
    });

    (apiClient.post as jest.Mock).mockClear();
    await clickAndFlush(detailLink);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_card_open',
        draftId: 'draft-progress-telemetry',
        source: 'feed',
      }),
    );
  });

  test('renders hot now cards with reason label', async () => {
    const payload = [
      {
        draftId: 'draft-hot-1',
        title: 'Hot Draft',
        glowUpScore: 9.1,
        hotScore: 1.7831,
        reasonLabel: '2 PR pending, 1 merge in 24h',
      },
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: payload });

    await renderFeedTabs();

    const hotNowTab = screen.getByRole('button', { name: /Hot Now/i });
    await clickAndFlush(hotNowTab);

    await waitFor(() =>
      expect(screen.getByText(/Hot Draft/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Why hot: 2 PR pending, 1 merge in 24h/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hot 1.78/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open detail/i })).toHaveAttribute(
      'href',
      '/drafts/draft-hot-1',
    );
  });

  test('renders guild cards', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'guild-1',
            name: 'Guild Arc',
            themeOfWeek: 'Futuristic',
            agentCount: 8,
          },
        ],
      });

    await renderFeedTabs();

    const guildTab = screen.getByRole('button', { name: /Guilds/i });
    await clickAndFlush(guildTab);

    await waitFor(() =>
      expect(screen.getByText(/Guild Arc/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Agents: 8/i)).toBeInTheDocument();
  });

  test('renders changes feed with fix-request mapping and defaults', async () => {
    const occurredAt = new Date().toISOString();
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'change-fix',
            kind: 'fix_request',
            draft_id: 'draft-fix',
            draft_title: 'Fix Request Draft',
            description: 'Need stronger contrast in CTA.',
            severity: 'minor',
            occurred_at: occurredAt,
            glow_up_score: 6.2,
            impact_delta: 4,
          },
          {
            id: 'change-merge',
            kind: 'unknown_kind',
            draft_id: 'draft-merge',
            draft_title: 'Merged Draft',
            description: 'Default mapping should treat as merged.',
            severity: 'unexpected',
          },
        ],
      });

    await renderFeedTabs();

    const changesTab = screen.getByRole('button', { name: /Changes/i });
    await clickAndFlush(changesTab);

    await waitFor(() =>
      expect(screen.getByText(/Fix Request Draft/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Fix request$/i)).toBeInTheDocument();
    expect(screen.getByText(/minor/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact \+4/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp 6.2/i)).toBeInTheDocument();
    expect(screen.getByText(/Merged Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/PR merged/i)).toBeInTheDocument();
  });

  test('renders archive drafts when entries are not autopsies', async () => {
    const archivePayload = [
      {
        id: 'rel-123',
        type: 'release',
        glowUpScore: 2,
        updatedAt: new Date().toISOString(),
      },
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: archivePayload });

    await renderFeedTabs();

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await clickAndFlush(archiveTab);

    await waitFor(() =>
      expect(screen.getByText(/Release rel-123/i)).toBeInTheDocument(),
    );
  });

  test('falls back to demo studios when studios feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('studios failed'));

    await renderFeedTabs();

    const studiosTab = screen.getByRole('button', { name: /Studios/i });
    await clickAndFlush(studiosTab);

    await waitFor(() =>
      expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Fallback data/i)).toBeInTheDocument();
  });

  test('falls back to demo autopsies when archive feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('archive failed'));

    await renderFeedTabs();

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await clickAndFlush(archiveTab);

    await waitFor(() =>
      expect(
        screen.getByText(/Common issues: low fix-request activity/i),
      ).toBeInTheDocument(),
    );
  });

  test('falls back to demo progress when progress feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('progress failed'));

    await renderFeedTabs();

    const progressTab = screen.getByRole('button', { name: /Progress/i });
    await clickAndFlush(progressTab);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Before \/ After/i)).toBeInTheDocument();
    expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument();
  });

  test('falls back to demo hot-now entries when feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('hot now failed'));

    await renderFeedTabs();

    const hotNowTab = screen.getByRole('button', { name: /Hot Now/i });
    await clickAndFlush(hotNowTab);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Synthwave Poster/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Why hot: 3 PR pending, 2 open fix/i),
    ).toBeInTheDocument();
  });

  test('falls back to demo guilds when guild feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('guild failed'));

    await renderFeedTabs();

    const guildTab = screen.getByRole('button', { name: /Guilds/i });
    await clickAndFlush(guildTab);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Guild Arc/i)).toBeInTheDocument();
  });

  test('falls back to demo changes when changes feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('changes failed'));

    await renderFeedTabs();

    const changesTab = screen.getByRole('button', { name: /Changes/i });
    await clickAndFlush(changesTab);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Hero composition refresh/i)).toBeInTheDocument();
  });

  test('renders release items and fallback glowup scores', async () => {
    const payload = [
      { id: 'rel-1234567', type: 'release', glow_up_score: 8.2 },
      { id: 'draft-99', type: 'draft' },
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: payload });

    await renderFeedTabs();

    const forYouTab = screen.getByRole('button', { name: /For You/i });
    await clickAndFlush(forYouTab);

    await waitFor(() =>
      expect(screen.getByText(/^Release /i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/GlowUp score: 8.2/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp score: 0.0/i)).toBeInTheDocument();
  });

  test('renders archive items with fallback fields', async () => {
    const publishedAt = new Date('2024-01-01T00:00:00Z').toISOString();
    const updatedAt = new Date('2024-02-01T00:00:00Z').toISOString();
    const updatedAtSnake = new Date('2024-03-01T00:00:00Z').toISOString();
    const archivePayload = [
      { id: 'auto-pub', type: 'autopsy', published_at: publishedAt },
      {
        id: 'auto-updated',
        type: 'autopsy',
        summary: 'Updated summary',
        updatedAt,
      },
      {
        id: 'auto-snake',
        summary: 'Snake summary',
        updated_at: updatedAtSnake,
      },
      {
        id: 'draft-arch',
        type: 'draft',
        glow_up_score: 4.2,
        updated_at: updatedAtSnake,
      },
    ];

    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: archivePayload });

    await renderFeedTabs();

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await clickAndFlush(archiveTab);

    await waitFor(() =>
      expect(screen.getByText(/Autopsy report/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(new Date(publishedAt).toLocaleString()),
    ).toBeInTheDocument();
    expect(screen.getByText(/Updated summary/i)).toBeInTheDocument();
    expect(
      screen.getByText(new Date(updatedAt).toLocaleString()),
    ).toBeInTheDocument();
    expect(screen.getByText(/Snake summary/i)).toBeInTheDocument();
    expect(
      screen.getByText(new Date(updatedAtSnake).toLocaleString()),
    ).toBeInTheDocument();
    expect(screen.getByText(/Draft draft-ar/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp score: 4.2/i)).toBeInTheDocument();
  });

  test('uses studio fallbacks when values are missing', async () => {
    const studiosPayload = [
      { id: 'studio-1', studio_name: 'Studio Snake', impact: 5 },
      { id: 'studio-2' },
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: studiosPayload });

    await renderFeedTabs();

    const studiosTab = screen.getByRole('button', { name: /Studios/i });
    await clickAndFlush(studiosTab);

    await waitFor(() =>
      expect(screen.getByText(/Studio Snake/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Studio$/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact 5.0/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Signal 0.0/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Impact 0.0/i).length).toBeGreaterThan(0);
  });

  test('appends fallback glowups when for-you pagination fails', async () => {
    const firstPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index}`,
      type: 'draft',
      glowUpScore: 1,
    }));
    const fallbackPage = [{ id: 'fallback-1', type: 'draft', glowUpScore: 2 }];

    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: firstPage })
      .mockRejectedValueOnce(new Error('for-you page failed'))
      .mockResolvedValueOnce({ data: fallbackPage });

    await renderFeedTabs();

    const forYouTab = screen.getByRole('button', { name: /For You/i });
    await clickAndFlush(forYouTab);

    const loadMore = await screen.findByRole('button', { name: /Load more/i });
    await clickAndFlush(loadMore);

    await waitFor(() =>
      expect(screen.getByText(/Draft fallback/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Draft draft-0/i)).toBeInTheDocument();
    expect(screen.getByText(/Fallback data/i)).toBeInTheDocument();
  });

  test('loads next page on scroll near bottom', async () => {
    const firstPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index}`,
      type: 'draft',
      glowUpScore: 1,
    }));
    const secondPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index + 6}`,
      type: 'draft',
      glowUpScore: 1,
    }));
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });

    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
    });
    Object.defineProperty(window, 'scrollY', { value: 300, writable: true });
    Object.defineProperty(document.body, 'offsetHeight', {
      value: 1000,
      writable: true,
    });

    await renderFeedTabs();

    await screen.findByText(/Draft draft-0/i);

    await scrollAndFlush();

    await waitFor(() =>
      expect((apiClient.get as jest.Mock).mock.calls.length).toBeGreaterThan(1),
    );
    const lastCall = (apiClient.get as jest.Mock).mock.calls.at(-1);
    expect(lastCall[1].params.offset).toBe(6);
  });

  test('does not paginate on scroll when hasMore is false', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 'draft-single', type: 'draft', glowUpScore: 1 }],
    });

    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
    });
    Object.defineProperty(window, 'scrollY', { value: 300, writable: true });
    Object.defineProperty(document.body, 'offsetHeight', {
      value: 1000,
      writable: true,
    });

    await renderFeedTabs();
    await screen.findByText(/Draft draft-si/i);

    const beforeScrollCalls = (apiClient.get as jest.Mock).mock.calls.length;
    await scrollAndFlush();
    const afterScrollCalls = (apiClient.get as jest.Mock).mock.calls.length;

    expect(afterScrollCalls).toBe(beforeScrollCalls);
  });

  test('falls back to demo drafts when live drafts fail', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('live drafts failed'));

    await renderFeedTabs();

    const liveTab = screen.getByRole('button', { name: /Live Drafts/i });
    await clickAndFlush(liveTab);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Synthwave Poster/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/i })).toBeNull();
  });

  test('shows load more when more pages are available', async () => {
    const firstPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index}`,
      type: 'draft',
      glowUpScore: 1,
    }));
    const secondPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index + 6}`,
      type: 'draft',
      glowUpScore: 1,
    }));
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });

    await renderFeedTabs();

    const forYouTab = screen.getByRole('button', { name: /For You/i });
    await clickAndFlush(forYouTab);

    const loadMore = await screen.findByRole('button', { name: /Load more/i });
    await clickAndFlush(loadMore);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    const lastCall = (apiClient.get as jest.Mock).mock.calls.at(-1) as any;
    expect(lastCall[0]).toBe('/feeds/for-you');
    expect(lastCall[1].params.offset).toBe(6);
  });

  test('syncs filters to URL query', async () => {
    searchParams = new URLSearchParams('tab=All');
    await renderFeedTabs();

    const sortSelect = screen.getByLabelText(/Sort/i);
    await changeAndFlush(sortSelect, 'impact');
    expect(replaceMock).toHaveBeenCalled();
    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('/feed');
    expect(lastCall).toContain('sort=impact');

    const statusSelect = screen.getByLabelText(/Status/i);
    await changeAndFlush(statusSelect, 'release');
    const statusCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(statusCall).toContain('status=release');

    const rangeSelect = screen.getByLabelText(/Time range/i);
    await changeAndFlush(rangeSelect, '90d');
    const rangeCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(rangeCall).toContain('range=90d');

    const intentSelect = screen.getByLabelText(/^Intent$/i);
    await changeAndFlush(intentSelect, 'needs_help');
    const intentCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(intentCall).toContain('intent=needs_help');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_filter_change',
        range: '90d',
      }),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_filter_change',
        intent: 'needs_help',
      }),
    );
  });

  test('applies intent preset chips and tracks telemetry', async () => {
    searchParams = new URLSearchParams('tab=All');
    await renderFeedTabs();
    (apiClient.post as jest.Mock).mockClear();

    const needsHelpChip = screen.getByRole('button', { name: /Needs help/i });
    await clickAndFlush(needsHelpChip);

    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('intent=needs_help');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_intent_preset',
        intent: 'needs_help',
      }),
    );
  });

  test('includes all-feed intent parameter for non-default intent', async () => {
    searchParams = new URLSearchParams('tab=All&intent=needs_help');
    await renderFeedTabs();

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/feed',
        expect.objectContaining({
          params: expect.objectContaining({ intent: 'needs_help' }),
        }),
      ),
    );
  });

  test('omits from param when all-time range is selected', async () => {
    searchParams = new URLSearchParams('tab=All&range=all');
    await renderFeedTabs();

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/feed',
        expect.objectContaining({
          params: expect.not.objectContaining({ from: expect.anything() }),
        }),
      ),
    );
  });

  test('reads filters from URL query', async () => {
    searchParams = new URLSearchParams(
      'tab=All&sort=impact&status=release&range=7d&intent=seeking_pr',
    );
    await renderFeedTabs();

    expect((screen.getByLabelText(/Sort/i) as HTMLSelectElement).value).toBe(
      'impact',
    );
    expect((screen.getByLabelText(/Status/i) as HTMLSelectElement).value).toBe(
      'release',
    );
    expect(
      (screen.getByLabelText(/Time range/i) as HTMLSelectElement).value,
    ).toBe('7d');
    expect(
      (screen.getByLabelText(/^Intent$/i) as HTMLSelectElement).value,
    ).toBe('seeking_pr');
  });
});
