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
import { SWRConfig } from 'swr';
import StudioProfilePage from '../app/studios/[id]/page';
import { apiClient } from '../lib/api';

let mockParams: { id?: string | string[] } = {};

jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('studio profile UI', () => {
  beforeEach(() => {
    mockParams = { id: 'studio-1' };
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });
    (apiClient.delete as jest.Mock).mockReset();
    (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });
  });

  test('renders studio profile', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: { impact: 12, signal: 70 } });
      }
      return Promise.resolve({
        data: {
          studioName: 'Studio Nova',
          personality: 'Sharp critic',
          follower_count: 10,
          is_following: false,
        },
      });
    });

    await act(() => {
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Top GlowUps/i)).toBeInTheDocument();
    expect(screen.getByText(/Followers:\s*10/i)).toBeInTheDocument();
  });

  test('toggles studio follow state from profile header', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: { impact: 12, signal: 70 } });
      }
      if (url.includes('/ledger')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          studioName: 'Studio Follow',
          personality: 'Bold maker',
          follower_count: 2,
          is_following: false,
        },
      });
    });

    await act(() => {
      mockParams = { id: 'studio-follow' };
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio Follow/i)).toBeInTheDocument(),
    );

    const followButton = screen.getByRole('button', { name: /^Follow$/i });
    fireEvent.click(followButton);

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/studios/studio-follow/follow',
      ),
    );
    expect(
      screen.getByRole('button', { name: /^Following$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Followers:\s*3/i)).toBeInTheDocument();
  });

  test('toggles studio unfollow state from profile header', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: { impact: 9, signal: 55 } });
      }
      if (url.includes('/ledger')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: {
          studioName: 'Studio Unfollow',
          personality: 'Calm reviewer',
          follower_count: 7,
          is_following: true,
        },
      });
    });

    await act(() => {
      mockParams = { id: 'studio-unfollow' };
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio Unfollow/i)).toBeInTheDocument(),
    );

    const followingButton = screen.getByRole('button', {
      name: /^Following$/i,
    });
    fireEvent.click(followingButton);

    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith(
        '/studios/studio-unfollow/follow',
      ),
    );
    expect(
      screen.getByRole('button', { name: /^Follow$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Followers:\s*6/i)).toBeInTheDocument();
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

  test('keeps profile page available when studio endpoint fails but metrics load', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: { impact: 44, signal: 81 } });
      }
      if (url.includes('/ledger')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error('Studio endpoint unavailable'));
    });

    await act(() => {
      mockParams = { id: 'studio-partial' };
      render(<StudioProfilePage />);
    });

    await waitFor(() =>
      expect(screen.getByText(/studio-partial/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Impact 44.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal 81.0/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Studio endpoint unavailable/i),
    ).not.toBeInTheDocument();
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

  test('keeps previous metrics and ledger entries on partial refresh failure', async () => {
    const cache = new Map();
    let phase: 'initial' | 'refresh' = 'initial';
    const occurredAt = new Date('2026-02-08T12:00:00.000Z').toISOString();

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (phase === 'initial') {
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
            ],
          });
        }
        return Promise.resolve({
          data: { studioName: 'Studio Stable', personality: 'Consistent' },
        });
      }

      if (url.includes('/metrics')) {
        return Promise.reject(new Error('Metrics refresh failed'));
      }
      if (url.includes('/ledger')) {
        return Promise.reject(new Error('Ledger refresh failed'));
      }
      return Promise.resolve({
        data: { studioName: 'Studio Stable', personality: 'Consistent' },
      });
    });

    const firstRender = render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <StudioProfilePage />
      </SWRConfig>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio PR Draft/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Impact 21.0/i)).toBeInTheDocument();

    phase = 'refresh';
    firstRender.unmount();

    await act(() => {
      render(
        <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
          <StudioProfilePage />
        </SWRConfig>,
      );
    });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(6));
    expect(screen.getByText(/Studio PR Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact 21.0/i)).toBeInTheDocument();
    expect(screen.queryByText(/Metrics refresh failed/i)).toBeNull();
    expect(screen.queryByText(/Ledger refresh failed/i)).toBeNull();
  });
});
