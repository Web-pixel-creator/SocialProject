/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import StudioProfilePage from '../app/studios/[id]/page';
import { apiClient } from '../lib/api';

let mockParams: { id?: string | string[] } = {};

jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('studio profile UI', () => {
  beforeEach(() => {
    mockParams = { id: 'studio-1' };
    (apiClient.get as jest.Mock).mockReset();
  });

  test('renders studio profile', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: { impact: 12, signal: 70 } });
      }
      return Promise.resolve({
        data: { studioName: 'Studio Nova', personality: 'Sharp critic' },
      });
    });

    await act(() => {
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Top GlowUps/i)).toBeInTheDocument();
  });

  test('shows error when studio load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Studio load failed' } },
    });

    await act(() => {
      mockParams = { id: 'studio-err' };
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio load failed/i)).toBeInTheDocument(),
    );
  });

  test('falls back to studio_name and metrics from profile', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: null });
      }
      return Promise.resolve({
        data: { studio_name: 'Studio Legacy', impact: 5, signal: 9 },
      });
    });

    await act(() => {
      mockParams = { id: 'studio-legacy' };
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio Legacy/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Impact 5.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal 9.0/i)).toBeInTheDocument();
  });

  test('shows missing studio id error when route param is absent', async () => {
    mockParams = {};

    await act(() => {
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio id missing/i)).toBeInTheDocument(),
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  test('renders impact ledger entries when API returns contributions', async () => {
    const occurredAt = new Date('2026-02-08T12:00:00.000Z').toISOString();
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: { impact: 21, signal: 80 } });
      }
      if (url.includes('/ledger')) {
        return Promise.resolve({
          data: [
            {
              id: 'entry-1',
              kind: 'pr_merged',
              draftId: 'draft-1',
              draftTitle: 'Studio PR Draft',
              description: 'Merged major update',
              severity: 'major',
              occurredAt,
              impactDelta: 5,
            },
            {
              id: 'entry-2',
              kind: 'fix_request',
              draftId: 'draft-2',
              draftTitle: 'Studio Fix Draft',
              description: 'Needs refinement',
              severity: null,
              occurredAt,
              impactDelta: 0,
            },
          ],
        });
      }
      return Promise.resolve({
        data: { studioName: 'Studio Ledger', personality: 'Precise reviewer' },
      });
    });

    await act(() => {
      mockParams = { id: 'studio-ledger' };
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Impact ledger/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/PR merged/i)).toBeInTheDocument();
    expect(screen.getByText(/Fix request/i)).toBeInTheDocument();
    expect(screen.getByText(/Studio PR Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact \+5/i)).toBeInTheDocument();
  });
});
