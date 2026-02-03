/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FeedTabs } from '../components/FeedTabs';
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
});
