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
import SearchPage from '../app/search/page';
import { apiClient } from '../lib/api';
import {
  assignAbProfile,
  getDefaultSearchAbWeights,
} from '../lib/searchProfiles';

let searchParams: URLSearchParams | null = new URLSearchParams('');
const pushMock = jest.fn();
const replaceMock = jest.fn();
const prefetchMock = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    prefetch: prefetchMock,
  }),
}));

jest.mock('../lib/config', () => ({
  API_BASE_URL: 'http://localhost:4000/api',
  WS_BASE_URL: 'ws://localhost:4000',
  SEARCH_AB_ENABLED: true,
  SEARCH_DEFAULT_PROFILE: 'balanced',
  SEARCH_AB_WEIGHTS: { balanced: 0.5, quality: 0.5, novelty: 0 },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, onClick, children, ...props }: any) => {
    const resolvedHref =
      typeof href === 'string' ? href : (href?.pathname ?? '');
    return (
      <a
        href={resolvedHref}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </a>
    );
  },
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: [] })),
  },
  setAuthToken: jest.fn(),
}));

describe('search UI', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchParams = new URLSearchParams('');
    localStorage.clear();
    pushMock.mockReset();
    replaceMock.mockReset();
    prefetchMock.mockReset();
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const runDebounce = async () => {
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
  };

  test('updates search query', async () => {
    render(<SearchPage />);
    await runDebounce();
    (apiClient.get as jest.Mock).mockClear();

    const input = screen.getByPlaceholderText(/Search by keyword/i);
    fireEvent.change(input, { target: { value: 'neon' } });
    await runDebounce();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByText(/Results for "neon"/i)).toBeInTheDocument();
  });

  test('renders results and respects filters', async () => {
    render(<SearchPage />);
    await runDebounce();
    (apiClient.get as jest.Mock).mockClear();
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [
        { id: 'studio-1', type: 'studio', title: 'Studio Apex', score: 9.5 },
      ],
    });

    const [typeSelect, _intentSelect, sortSelect, rangeSelect] =
      screen.getAllByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText(/Search by keyword/i), {
      target: { value: 'apex' },
    });
    fireEvent.change(typeSelect, { target: { value: 'studio' } });
    fireEvent.change(sortSelect, { target: { value: 'impact' } });
    fireEvent.change(rangeSelect, { target: { value: '7d' } });

    await runDebounce();

    const title = await screen.findByText(/Studio Apex/i);
    expect(screen.getByText(/Score 9.5/i)).toBeInTheDocument();

    const lastCall = (apiClient.get as jest.Mock).mock.calls.at(-1);
    expect(lastCall[0]).toBe('/search');
    expect(lastCall[1].params).toEqual({
      q: 'apex',
      type: 'studio',
      sort: 'impact',
      range: '7d',
    });

    const link = title.closest('a');
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute('href', '/studios/studio-1');

    fireEvent.click(link as HTMLAnchorElement);
    const openCall = (apiClient.post as jest.Mock).mock.calls.find(
      (call) =>
        call[0] === '/telemetry/ux' &&
        call[1]?.eventType === 'search_result_open',
    );
    expect(openCall?.[1]).toMatchObject({
      eventType: 'search_result_open',
      sort: 'impact',
      status: 'studio',
      range: '7d',
      metadata: {
        mode: 'text',
        profile: 'balanced',
        resultType: 'studio',
        resultId: 'studio-1',
        queryLength: 4,
        rank: 1,
      },
    });
  });

  test('shows error message on failed search', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Search unavailable' } },
    });

    render(<SearchPage />);
    await runDebounce();

    await waitFor(() =>
      expect(screen.getByText(/Search unavailable/i)).toBeInTheDocument(),
    );
  });

  test('handles null response data gracefully', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: null });

    render(<SearchPage />);
    await runDebounce();

    await waitFor(() =>
      expect(screen.getByText(/No results yet/i)).toBeInTheDocument(),
    );
  });

  test('uses fallback error message when response is missing', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(
      new Error('Network down'),
    );

    render(<SearchPage />);
    await runDebounce();

    expect(await screen.findByText(/Network down/i)).toBeInTheDocument();
  });

  test('renders loading state while awaiting results', async () => {
    (apiClient.get as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: [] }), 500);
        }),
    );

    render(<SearchPage />);
    await act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByText(/Searching/i)).toBeInTheDocument();
  });

  test('renders result rows with formatted score', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 'res-1', type: 'draft', title: 'Neon Draft', score: null }],
    });

    render(<SearchPage />);
    await runDebounce();

    expect(await screen.findByText(/Neon Draft/i)).toBeInTheDocument();
    expect(await screen.findByText(/Score 0.0/i)).toBeInTheDocument();
  });

  test('runs visual search with embedding input', async () => {
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/search/visual') {
        return Promise.resolve({
          data: [
            {
              id: 'draft-1',
              type: 'draft',
              title: 'Vision Draft',
              score: 0.85,
              glowUpScore: 4.2,
            },
          ],
        });
      }
      return Promise.resolve({ data: { status: 'ok' } });
    });

    render(<SearchPage />);
    await runDebounce();
    (apiClient.get as jest.Mock).mockClear();

    fireEvent.click(screen.getByRole('button', { name: /visual search/i }));

    fireEvent.change(screen.getByPlaceholderText(/Embedding/i), {
      target: { value: '[0.1, 0.2]' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Style tags/i), {
      target: { value: 'neo, bold' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run visual search/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const searchCall = (apiClient.post as jest.Mock).mock.calls.find(
      (call) => call[0] === '/search/visual',
    );
    expect(searchCall?.[1]).toEqual({
      embedding: [0.1, 0.2],
      draftId: undefined,
      type: 'draft',
      tags: ['neo', 'bold'],
    });

    expect(await screen.findByText(/Vision Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp 4.2/i)).toBeInTheDocument();
  });

  test('prefills visual mode from query params', async () => {
    searchParams = new URLSearchParams(
      'mode=visual&draftId=draft-123&type=draft',
    );

    render(<SearchPage />);

    const draftInput = await screen.findByPlaceholderText(/Draft ID/i);
    expect(draftInput).toHaveValue('draft-123');

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const searchCall = (apiClient.post as jest.Mock).mock.calls.find(
      (call) => call[0] === '/search/visual',
    );
    expect(searchCall?.[1]).toMatchObject({
      draftId: 'draft-123',
      type: 'draft',
    });
  });

  test('supports ab entrypoint and emits chosen profile', async () => {
    searchParams = new URLSearchParams('ab=1');
    localStorage.setItem('searchVisitorId', 'visitor-ab-test');
    const expectedProfile = assignAbProfile(
      'visitor-ab-test',
      getDefaultSearchAbWeights(),
    );

    render(<SearchPage />);
    await runDebounce();

    expect(
      screen.getByText(new RegExp(`AB ${expectedProfile}`, 'i')),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by keyword/i), {
      target: { value: 'studio' },
    });
    await runDebounce();

    const performedCall = (apiClient.post as jest.Mock).mock.calls.find(
      (call) =>
        call[0] === '/telemetry/ux' &&
        call[1]?.eventType === 'search_performed',
    );

    expect(performedCall?.[1]?.metadata?.profile).toBe(expectedProfile);
  });

  test('keeps from=similar in URL sync and scrolls to top once', async () => {
    searchParams = new URLSearchParams('from=similar');
    const scrollSpy = jest
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);

    render(<SearchPage />);
    await runDebounce();

    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    fireEvent.change(screen.getByPlaceholderText(/Search by keyword/i), {
      target: { value: 'similar draft' },
    });
    await runDebounce();

    const lastReplace = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastReplace).toContain('q=similar+draft');
    expect(lastReplace).toContain('from=similar');

    scrollSpy.mockRestore();
  });

  test('normalizes query comparisons when duplicate params exist', async () => {
    searchParams = new URLSearchParams('q=beta&q=alpha');

    render(<SearchPage />);
    await runDebounce();

    fireEvent.change(screen.getByPlaceholderText(/Search by keyword/i), {
      target: { value: 'beta' },
    });
    await runDebounce();

    expect(apiClient.get).toHaveBeenCalled();
  });

  test('resets intent to all when type switches to studio', async () => {
    render(<SearchPage />);
    await runDebounce();

    const [typeSelect, intentSelect] = screen.getAllByRole(
      'combobox',
    ) as HTMLSelectElement[];

    fireEvent.change(intentSelect, { target: { value: 'needs_help' } });
    await runDebounce();
    expect(intentSelect.value).toBe('needs_help');

    fireEvent.change(typeSelect, { target: { value: 'studio' } });
    await runDebounce();

    expect(intentSelect.value).toBe('all');
    const intentReplace = replaceMock.mock.calls
      .map((call) => call[0] as string)
      .find((value) => value.includes('intent=needs_help'));
    expect(intentReplace).toBeTruthy();
  });

  test('validates visual input when embedding is non-array or invalid JSON', async () => {
    render(<SearchPage />);
    await runDebounce();

    fireEvent.click(screen.getByRole('button', { name: /visual search/i }));

    fireEvent.change(screen.getByPlaceholderText(/Embedding/i), {
      target: { value: '{"x":1}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run visual search/i }));
    expect(
      await screen.findByText(/Provide a draft ID or an embedding array/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Embedding/i), {
      target: { value: '[invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run visual search/i }));
    expect(
      await screen.findByText(/Provide a draft ID or an embedding array/i),
    ).toBeInTheDocument();
  });

  test('handles visual search embedding-not-found and generic failures', async () => {
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/search/visual') {
        return Promise.reject({
          response: { data: { error: 'EMBEDDING_NOT_FOUND' } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<SearchPage />);
    await runDebounce();
    fireEvent.click(screen.getByRole('button', { name: /visual search/i }));

    fireEvent.change(screen.getByPlaceholderText(/Draft ID/i), {
      target: { value: 'draft-visual-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run visual search/i }));

    expect(
      await screen.findByText(/Similar works available after analysis/i),
    ).toBeInTheDocument();

    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/search/visual') {
        return Promise.reject({
          response: { data: { message: 'Visual search unavailable' } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    fireEvent.click(screen.getByRole('button', { name: /run visual search/i }));
    expect(
      await screen.findByText(/Visual search unavailable/i),
    ).toBeInTheDocument();
  });

  test('does not auto-run visual search when draftId is blank after trim', async () => {
    searchParams = new URLSearchParams('mode=visual&draftId=%20%20%20');

    render(<SearchPage />);
    await runDebounce();

    const visualCalls = (apiClient.post as jest.Mock).mock.calls.filter(
      (call) => call[0] === '/search/visual',
    );
    expect(visualCalls.length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /text search/i }));
    expect(
      screen.getByPlaceholderText(/Search by keyword/i),
    ).toBeInTheDocument();
  });

  test('handles missing search params object', async () => {
    searchParams = null;

    render(<SearchPage />);
    await runDebounce();

    expect(
      screen.getByText(/Find drafts, releases, and studios/i),
    ).toBeInTheDocument();
  });
});
