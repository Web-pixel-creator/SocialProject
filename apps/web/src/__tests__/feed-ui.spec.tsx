/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FeedTabs, endpointForTab } from '../components/FeedTabs';
import { DraftCard } from '../components/DraftCard';
import { apiClient } from '../lib/api';
jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] }))
  },
  setAuthToken: jest.fn()
}));

describe('feed UI', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  });

  test('renders draft card', () => {
    render(<DraftCard id="draft-1" title="Test Draft" glowUpScore={3.2} live />);
    expect(screen.getByText(/Test Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });

  test('switches tabs', async () => {
    await act(async () => {
      render(<FeedTabs />);
    });
    await act(async () => {
      await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    });
    const tab = screen.getByRole('button', { name: /GlowUps/i });
    await act(async () => {
      fireEvent.click(tab);
    });
    expect(tab).toHaveClass('bg-ink');
  });

  test('falls back when for-you feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockRejectedValueOnce(new Error('for-you failed'))
      .mockResolvedValueOnce({ data: [] });

    await act(async () => {
      render(<FeedTabs />);
    });

    await waitFor(() => expect(screen.getByText(/Fallback data/i)).toBeInTheDocument());
  });

  test('renders archive autopsy items', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ id: 'auto-1', summary: 'Autopsy summary', publishedAt: new Date().toISOString() }]
      });

    await act(async () => {
      render(<FeedTabs />);
    });

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await act(async () => {
      fireEvent.click(archiveTab);
    });

    await waitFor(() => expect(screen.getByText(/Autopsy summary/i)).toBeInTheDocument());
  });

  test('renders studio cards', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ id: 'studio-9', studioName: 'Studio Nine', impact: 10, signal: 5 }]
      });

    await act(async () => {
      render(<FeedTabs />);
    });

    const studiosTab = screen.getByRole('button', { name: /Studios/i });
    await act(async () => {
      fireEvent.click(studiosTab);
    });

    await waitFor(() => expect(screen.getByText(/Studio Nine/i)).toBeInTheDocument());
    expect(screen.getByText(/Impact 10.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal 5.0/i)).toBeInTheDocument();
  });

  test('falls back to glowups endpoint for unknown tab', () => {
    expect(endpointForTab('Unknown')).toBe('/feeds/glowups');
  });

  test('requests battles feed endpoint', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });

    await act(async () => {
      render(<FeedTabs />);
    });

    const battlesTab = screen.getByRole('button', { name: /Battles/i });
    await act(async () => {
      fireEvent.click(battlesTab);
    });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/feeds/battles', expect.anything())
    );
  });

  test('renders archive drafts when entries are not autopsies', async () => {
    const archivePayload = [
      { id: 'rel-123', type: 'release', glowUpScore: 2, updatedAt: new Date().toISOString() }
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: archivePayload });

    await act(async () => {
      render(<FeedTabs />);
    });

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await act(async () => {
      fireEvent.click(archiveTab);
    });

    await waitFor(() => expect(screen.getByText(/Release rel-123/i)).toBeInTheDocument());
  });

  test('falls back to demo studios when studios feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('studios failed'));

    await act(async () => {
      render(<FeedTabs />);
    });

    const studiosTab = screen.getByRole('button', { name: /Studios/i });
    await act(async () => {
      fireEvent.click(studiosTab);
    });

    await waitFor(() => expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument());
    expect(screen.getByText(/Fallback data/i)).toBeInTheDocument();
  });

  test('falls back to demo autopsies when archive feed fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('archive failed'));

    await act(async () => {
      render(<FeedTabs />);
    });

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await act(async () => {
      fireEvent.click(archiveTab);
    });

    await waitFor(() =>
      expect(screen.getByText(/Common issues: low fix-request activity/i)).toBeInTheDocument()
    );
  });

  test('renders release items and fallback glowup scores', async () => {
    const payload = [
      { id: 'rel-1234567', type: 'release', glow_up_score: 8.2 },
      { id: 'draft-99', type: 'draft' }
    ];
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: payload });

    await act(async () => {
      render(<FeedTabs />);
    });

    await waitFor(() => expect(screen.getByText(/^Release /i)).toBeInTheDocument());
    expect(screen.getByText(/GlowUp score: 8.2/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp score: 0.0/i)).toBeInTheDocument();
  });

  test('renders archive items with fallback fields', async () => {
    const publishedAt = new Date('2024-01-01T00:00:00Z').toISOString();
    const updatedAt = new Date('2024-02-01T00:00:00Z').toISOString();
    const updatedAtSnake = new Date('2024-03-01T00:00:00Z').toISOString();
    const archivePayload = [
      { id: 'auto-pub', type: 'autopsy', published_at: publishedAt },
      { id: 'auto-updated', type: 'autopsy', summary: 'Updated summary', updatedAt },
      { id: 'auto-snake', summary: 'Snake summary', updated_at: updatedAtSnake },
      { id: 'draft-arch', type: 'draft', glow_up_score: 4.2, updated_at: updatedAtSnake }
    ];

    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: archivePayload });

    await act(async () => {
      render(<FeedTabs />);
    });

    const archiveTab = screen.getByRole('button', { name: /Archive/i });
    await act(async () => {
      fireEvent.click(archiveTab);
    });

    await waitFor(() => expect(screen.getByText(/Autopsy report/i)).toBeInTheDocument());
    expect(screen.getByText(new Date(publishedAt).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(/Updated summary/i)).toBeInTheDocument();
    expect(screen.getByText(new Date(updatedAt).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(/Snake summary/i)).toBeInTheDocument();
    expect(screen.getByText(new Date(updatedAtSnake).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(/Draft draft-ar/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp score: 4.2/i)).toBeInTheDocument();
  });

  test('uses studio fallbacks when values are missing', async () => {
    const studiosPayload = [
      { id: 'studio-1', studio_name: 'Studio Snake', impact: 5 },
      { id: 'studio-2' }
    ];
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: studiosPayload });

    await act(async () => {
      render(<FeedTabs />);
    });

    const studiosTab = screen.getByRole('button', { name: /Studios/i });
    await act(async () => {
      fireEvent.click(studiosTab);
    });

    await waitFor(() => expect(screen.getByText(/Studio Snake/i)).toBeInTheDocument());
    expect(screen.getByText(/^Studio$/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact 5.0/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Signal 0.0/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Impact 0.0/i).length).toBeGreaterThan(0);
  });

  test('appends fallback glowups when for-you pagination fails', async () => {
    const firstPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index}`,
      type: 'draft',
      glowUpScore: 1
    }));
    const fallbackPage = [{ id: 'fallback-1', type: 'draft', glowUpScore: 2 }];

    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: firstPage })
      .mockRejectedValueOnce(new Error('for-you page failed'))
      .mockResolvedValueOnce({ data: fallbackPage });

    await act(async () => {
      render(<FeedTabs />);
    });

    const loadMore = await screen.findByRole('button', { name: /Load more/i });
    await act(async () => {
      fireEvent.click(loadMore);
    });

    await waitFor(() => expect(screen.getByText(/Draft fallback/i)).toBeInTheDocument());
    expect(screen.getByText(/Draft draft-0/i)).toBeInTheDocument();
    expect(screen.getByText(/Fallback data/i)).toBeInTheDocument();
  });

  test('loads next page on scroll near bottom', async () => {
    const firstPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index}`,
      type: 'draft',
      glowUpScore: 1
    }));
    const secondPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index + 6}`,
      type: 'draft',
      glowUpScore: 1
    }));
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });

    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 300, writable: true });
    Object.defineProperty(document.body, 'offsetHeight', { value: 1000, writable: true });

    await act(async () => {
      render(<FeedTabs />);
    });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.scroll(window);
    });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    const lastCall = (apiClient.get as jest.Mock).mock.calls[1];
    expect(lastCall[1].params.offset).toBe(6);
  });

  test('falls back to demo drafts when live drafts fail', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('live drafts failed'));

    await act(async () => {
      render(<FeedTabs />);
    });

    const liveTab = screen.getByRole('button', { name: /Live Drafts/i });
    await act(async () => {
      fireEvent.click(liveTab);
    });

    await waitFor(() => expect(screen.getByText(/Fallback data/i)).toBeInTheDocument());
    expect(screen.getByText(/Synthwave Poster/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/i })).toBeNull();
  });

  test('shows load more when more pages are available', async () => {
    const firstPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index}`,
      type: 'draft',
      glowUpScore: 1
    }));
    const secondPage = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index + 6}`,
      type: 'draft',
      glowUpScore: 1
    }));
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });

    await act(async () => {
      render(<FeedTabs />);
    });

    const loadMore = await screen.findByRole('button', { name: /Load more/i });
    await act(async () => {
      fireEvent.click(loadMore);
    });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    const lastCall = (apiClient.get as jest.Mock).mock.calls[1];
    expect(lastCall[0]).toBe('/feeds/for-you');
    expect(lastCall[1].params.offset).toBe(6);
  });
});
