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
  within,
} from '@testing-library/react';
import { mutate } from 'swr';
import { DraftCard } from '../components/DraftCard';
import { endpointForTab, FeedTabs } from '../components/FeedTabs';
import { apiClient } from '../lib/api';

let searchParams = new URLSearchParams('');
const replaceMock = jest.fn();

const syncSearchParamsFromUrl = (url: string) => {
  const [, queryString = ''] = url.split('?');
  searchParams = new URLSearchParams(queryString);
};

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
  await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
  await act(async () => {
    await flushAsync();
  });
};

const clickAndFlush = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
    await flushAsync();
  });
};

const pressEscapeAndFlush = async () => {
  await act(async () => {
    fireEvent.keyDown(window, { key: 'Escape' });
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

const openMoreTabs = async () => {
  const moreToggle = screen.getByText(/More|Р•С‰С‘/i);
  const detailsElement = moreToggle.closest('details');
  if (detailsElement) {
    if (detailsElement.hasAttribute('open')) {
      return;
    }
    await clickAndFlush(moreToggle as HTMLElement);
    return;
  }

  if (moreToggle.getAttribute('aria-expanded') === 'true') {
    return;
  }

  await clickAndFlush(moreToggle as HTMLElement);
};

const openTab = async (label: RegExp) => {
  const directButton = screen.queryByRole('button', { name: label });
  if (directButton) {
    await clickAndFlush(directButton);
    return directButton;
  }

  await openMoreTabs();
  const nestedButton = screen.getByRole('button', { name: label });
  await clickAndFlush(nestedButton);
  return nestedButton;
};

const openFilters = async () => {
  const filtersButton = screen.queryByRole('button', {
    name: /^(Filters|Р¤РёР»СЊС‚СЂС‹)\s*[+-]?$/i,
  });
  if (!filtersButton) {
    return;
  }

  if (filtersButton.getAttribute('aria-expanded') !== 'true') {
    await clickAndFlush(filtersButton);
  }
};

const openControls = async () => {
  await openMoreTabs();
};
describe('feed UI', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });
    replaceMock.mockReset();
    replaceMock.mockImplementation((url: string) => {
      syncSearchParamsFromUrl(url);
    });
    searchParams = new URLSearchParams('');
    window.localStorage.setItem('finishit-feed-density', 'comfort');
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
      configurable: true,
    });
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
    const tab = await openTab(/GlowUps/i);
    expect(tab).toHaveAttribute('aria-pressed', 'true');
    expect(tab).toHaveClass('text-primary');
  });

  test('switches feed density between comfort and compact', async () => {
    await renderFeedTabs();
    await openControls();

    const comfortButton = screen.getByRole('button', { name: /Comfort/i });
    const compactButton = screen.getByRole('button', { name: /Compact/i });

    expect(comfortButton).toHaveAttribute('aria-pressed', 'true');
    expect(compactButton).toHaveAttribute('aria-pressed', 'false');

    await clickAndFlush(compactButton);

    expect(comfortButton).toHaveAttribute('aria-pressed', 'false');
    expect(compactButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('defaults feed density to compact on mobile when preference is missing', async () => {
    window.localStorage.removeItem('finishit-feed-density');
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
      configurable: true,
    });

    await renderFeedTabs();
    await openControls();

    const comfortButton = screen.getByRole('button', { name: /Comfort/i });
    const compactButton = screen.getByRole('button', { name: /Compact/i });

    expect(comfortButton).toHaveAttribute('aria-pressed', 'false');
    expect(compactButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('opens filters as mobile bottom sheet on narrow viewport', async () => {
    searchParams = new URLSearchParams('tab=All');
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
      configurable: true,
    });

    await renderFeedTabs();
    await openFilters();

    expect(
      screen.getByRole('dialog', { name: /Filters/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Sort/i)).toBeInTheDocument();

    await clickAndFlush(screen.getByText(/^Close$/i));

    expect(
      screen.queryByRole('dialog', { name: /Filters/i }),
    ).not.toBeInTheDocument();
  });

  test('closes filters mobile bottom sheet with escape', async () => {
    searchParams = new URLSearchParams('tab=All');
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
      configurable: true,
    });

    await renderFeedTabs();
    await openFilters();

    expect(
      screen.getByRole('dialog', { name: /Filters/i }),
    ).toBeInTheDocument();

    await pressEscapeAndFlush();

    expect(
      screen.queryByRole('dialog', { name: /Filters/i }),
    ).not.toBeInTheDocument();
  });

  test('opens more controls as mobile bottom sheet on narrow viewport', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
      configurable: true,
    });

    await renderFeedTabs();
    await openMoreTabs();

    expect(screen.getByRole('dialog', { name: /More/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Progress/i }),
    ).toBeInTheDocument();

    await clickAndFlush(screen.getByText(/^Close$/i));

    expect(screen.queryByRole('dialog', { name: /More/i })).toBeNull();
  });

  test('closes more mobile bottom sheet with escape', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
      configurable: true,
    });

    await renderFeedTabs();
    await openMoreTabs();

    expect(screen.getByRole('dialog', { name: /More/i })).toBeInTheDocument();

    await pressEscapeAndFlush();

    expect(screen.queryByRole('dialog', { name: /More/i })).toBeNull();
  });

  test('falls back when for-you feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('for-you failed'))
      .mockResolvedValueOnce({ data: [] });

    await renderFeedTabs();

    await openTab(/For You/i);

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

    await openTab(/Archive/i);

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

    await openTab(/Studios/i);

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

    await openTab(/Battles/i);

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/feeds/battles',
        expect.anything(),
      ),
    );
  });

  test('renders battle cards with vote split and decision', async () => {
    const battlePayload = [
      {
        id: 'battle-1',
        title: 'PR Battle: Apex Studio vs Nova Forge',
        leftLabel: 'Apex Studio',
        rightLabel: 'Nova Forge',
        leftVote: 61,
        rightVote: 39,
        glowUpScore: 13.2,
        prCount: 7,
        fixCount: 4,
        decision: 'changes requested',
      },
    ];

    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: battlePayload });

    await renderFeedTabs();

    await openTab(/Battles/i);

    await waitFor(() =>
      expect(
        screen.getByText(/PR Battle: Apex Studio vs Nova Forge/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Apex Studio 61%/i)).toBeInTheDocument();
    expect(screen.getByText(/Nova Forge 39%/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Changes requested/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Open battle/i })).toHaveAttribute(
      'href',
      '/drafts/battle-1',
    );
  });

  test('filters battles by status chip and tracks telemetry', async () => {
    const battlePayload = [
      {
        id: 'battle-merged',
        title: 'PR Battle: Merged Battle',
        leftLabel: 'A',
        rightLabel: 'B',
        leftVote: 52,
        rightVote: 48,
        glowUpScore: 11,
        prCount: 4,
        fixCount: 3,
        decision: 'merged',
      },
      {
        id: 'battle-pending',
        title: 'PR Battle: Pending Battle',
        leftLabel: 'C',
        rightLabel: 'D',
        leftVote: 49,
        rightVote: 51,
        glowUpScore: 8,
        prCount: 2,
        fixCount: 2,
        decision: 'pending',
      },
    ];

    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: battlePayload });

    await renderFeedTabs();
    await openTab(/Battles/i);

    await waitFor(() =>
      expect(screen.getByText(/PR Battle: Merged Battle/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/PR Battle: Pending Battle/i)).toBeInTheDocument();

    (apiClient.post as jest.Mock).mockClear();
    await openFilters();
    const mergedFilter = screen.getByRole('button', { name: /^Merged$/i });
    await clickAndFlush(mergedFilter);

    expect(screen.getByText(/PR Battle: Merged Battle/i)).toBeInTheDocument();
    expect(screen.queryByText(/PR Battle: Pending Battle/i)).toBeNull();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_battle_filter',
        filter: 'merged',
      }),
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

    await openTab(/Progress/i);

    await waitFor(() =>
      expect(screen.getByText(/Before \/ After/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/\+9\.4%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/PRs 2/i)).toBeInTheDocument();
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
    await openTab(/Progress/i);
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

    await openTab(/Hot Now/i);

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

    await openTab(/Guilds/i);

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

    await openTab(/Changes/i);

    await waitFor(() =>
      expect(screen.getByText(/Fix Request Draft/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Fix request$/i)).toBeInTheDocument();
    expect(screen.getByText(/minor/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact \+4/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp 6.2/i)).toBeInTheDocument();
    expect(screen.getByText(/Merged Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/PR merged/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Mini-thread/i).length).toBeGreaterThan(0);
  });

  test('renders provided mini-thread lines in changes cards', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'change-thread',
            kind: 'fix_request',
            draft_id: 'draft-thread',
            draft_title: 'Thread Draft',
            description: 'Tune hierarchy',
            mini_thread: [
              'Fix Request: tune hierarchy',
              'Maker PR: #184 improved composition',
              'Author decision: merged',
            ],
          },
        ],
      });

    await renderFeedTabs();

    await openTab(/Changes/i);

    await waitFor(() =>
      expect(screen.getByText(/Thread Draft/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Fix Request: tune hierarchy/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Maker PR: #184 improved composition/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Author decision: merged/i)).toBeInTheDocument();
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

    await openTab(/Archive/i);

    await waitFor(() =>
      expect(screen.getByText(/Release rel-123/i)).toBeInTheDocument(),
    );
  });

  test('falls back to demo studios when studios feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('studios failed'));

    await renderFeedTabs();

    await openTab(/Studios/i);

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

    await openTab(/Archive/i);

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

    await openTab(/Progress/i);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/Before \/ After/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Studio Nova/i).length).toBeGreaterThan(0);
  });

  test('falls back to demo hot-now entries when feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('hot now failed'));

    await renderFeedTabs();

    await openTab(/Hot Now/i);

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

    await openTab(/Guilds/i);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Poster Guild/i)).toBeInTheDocument();
  });

  test('falls back to demo changes when changes feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('changes failed'));

    await renderFeedTabs();

    await openTab(/Changes/i);

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

    await openTab(/For You/i);

    await waitFor(() =>
      expect(screen.getByText(/^Release /i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/\+8\.2%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+0\.0%/i).length).toBeGreaterThan(0);
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

    await openTab(/Archive/i);

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
    expect(screen.getAllByText(/\+4\.2%/i).length).toBeGreaterThan(0);
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

    await openTab(/Studios/i);

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

    await openTab(/For You/i);

    const loadMore = await screen.findByRole('button', { name: /Load more/i });
    await clickAndFlush(loadMore);

    await waitFor(() =>
      expect(screen.getByText(/Draft fallback/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Draft draft-0/i)).toBeInTheDocument();
    expect(screen.getByText(/Fallback data/i)).toBeInTheDocument();
  });

  test('keeps current hot-now items when loading next page fails', async () => {
    const firstPage = Array.from({ length: 6 }, (_, index) => ({
      draftId: `hot-${index}`,
      title: `API Hot ${index + 1}`,
      glowUpScore: 2.1,
      hotScore: 1.2,
      reasonLabel: 'API trend',
    }));

    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: firstPage })
      .mockRejectedValueOnce(new Error('hot-now page failed'));

    await renderFeedTabs();

    await openTab(/Hot Now/i);

    await waitFor(() =>
      expect(screen.getByText(/API Hot 1/i)).toBeInTheDocument(),
    );

    const loadMore = await screen.findByRole('button', { name: /Load more/i });
    await clickAndFlush(loadMore);

    await waitFor(() =>
      expect(screen.getByText(/Fallback data/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/API Hot 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/Synthwave Poster/i)).toBeNull();
  });

  test('keeps current hot-now items when first-page refresh fails', async () => {
    searchParams = new URLSearchParams('tab=Hot%20Now');
    let phase: 'initial' | 'failed' = 'initial';

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/feeds/hot-now' && phase === 'initial') {
        return Promise.resolve({
          data: [
            {
              draftId: 'hot-stable',
              title: 'API Hot Stable',
              glowUpScore: 7.5,
              hotScore: 1.5,
              reasonLabel: 'Stable momentum',
            },
          ],
        });
      }
      return Promise.reject(new Error('refresh failed'));
    });

    render(<FeedTabs />);

    await waitFor(() =>
      expect(screen.getByText(/API Hot Stable/i)).toBeInTheDocument(),
    );

    phase = 'failed';
    await act(async () => {
      await mutate(
        (key) => Array.isArray(key) && key[0] === 'feed-tabs',
        undefined,
        {
          revalidate: true,
        },
      );
      await flushAsync();
    });

    await waitFor(() =>
      expect((apiClient.get as jest.Mock).mock.calls.length).toBeGreaterThan(1),
    );
    expect(screen.getByText(/API Hot Stable/i)).toBeInTheDocument();
    expect(screen.queryByText(/Synthwave Poster/i)).toBeNull();
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
      value: 1201,
      writable: true,
    });

    await renderFeedTabs();

    await screen.findByText(/Draft draft-0/i);

    await scrollAndFlush();

    await waitFor(() =>
      expect((apiClient.get as jest.Mock).mock.calls.length).toBeGreaterThan(1),
    );
    const calls = (apiClient.get as jest.Mock).mock.calls;
    expect(calls.some((call) => call[1]?.params?.offset === 6)).toBeTruthy();
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

    await openTab(/Live Drafts/i);

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

    await openTab(/For You/i);

    const loadMore = await screen.findByRole('button', { name: /Load more/i });
    await clickAndFlush(loadMore);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    const lastCall = (apiClient.get as jest.Mock).mock.calls.at(-1) as any;
    expect(lastCall[0]).toBe('/feeds/for-you');
    expect(lastCall[1].params.offset).toBe(6);
  });

  test('shows feed end indicator when all results are loaded', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 'draft-single', type: 'draft', glowUpScore: 1 }],
    });

    await renderFeedTabs();
    await screen.findByText(/Draft draft-si/i);

    const endIndicator = screen.getByTestId('feed-end-indicator');
    expect(endIndicator).toBeInTheDocument();
    expect(endIndicator).toHaveTextContent(/Results:\s*1\s*\/\s*1/i);
  });

  test('syncs filters to URL query', async () => {
    searchParams = new URLSearchParams('tab=All');
    await renderFeedTabs();
    await openFilters();

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

  test('updates intent through filters and tracks telemetry', async () => {
    searchParams = new URLSearchParams('tab=All');
    await renderFeedTabs();
    await openFilters();
    (apiClient.post as jest.Mock).mockClear();

    const intentSelect = screen.getByLabelText(/^Intent$/i);
    await changeAndFlush(intentSelect, 'needs_help');

    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('intent=needs_help');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_filter_change',
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

  test('includes q parameter for feed search query', async () => {
    searchParams = new URLSearchParams('tab=All&q=nova');
    await renderFeedTabs();

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/feed',
        expect.objectContaining({
          params: expect.objectContaining({ q: 'nova' }),
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
    await openFilters();

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

  test('shows active filter summary and reset action in empty state', async () => {
    searchParams = new URLSearchParams('tab=All&q=nomatch');
    await renderFeedTabs();

    await waitFor(() =>
      expect(screen.getByText(/Feed is quiet right now/i)).toBeInTheDocument(),
    );

    const emptyStateCard = screen
      .getByText(/Feed is quiet right now/i)
      .closest('.card');
    expect(emptyStateCard).not.toBeNull();

    const scoped = within(emptyStateCard as HTMLElement);
    expect(scoped.getByText(/Active filters:\s*1/i)).toBeInTheDocument();
    expect(scoped.getByText(/Search:\s*nomatch/i)).toBeInTheDocument();

    await clickAndFlush(scoped.getByRole('button', { name: /Reset filters/i }));

    const lastCall = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toBe('/feed');
    expect(lastCall).not.toContain('q=');
  });
});
