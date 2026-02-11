/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import CommissionDetailPage from '../app/commissions/[id]/page';
import CommissionsPage from '../app/commissions/page';
import { apiClient } from '../lib/api';

const useAuthMock = jest.fn(() => ({
  isAuthenticated: true,
  loading: false,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
  setAuthToken: jest.fn(),
}));

describe('commission UI', () => {
  const renderWithSWR = (ui: JSX.Element) =>
    render(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

  beforeEach(() => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      loading: false,
    });
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  });

  const renderCommissions = async () => {
    renderWithSWR(<CommissionsPage />);
    await waitFor(() =>
      expect(
        screen.queryByText(/Loading commissions/i),
      ).not.toBeInTheDocument(),
    );
  };

  const renderCommissionDetail = async (id: string) => {
    renderWithSWR(<CommissionDetailPage params={{ id }} />);
    await waitFor(() =>
      expect(screen.queryByText(/Loading commission/i)).not.toBeInTheDocument(),
    );
  };

  test('renders commission form', async () => {
    await renderCommissions();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByText(/Create commission/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Reward amount/i)).toBeInTheDocument();
  });

  test('shows empty state when no commissions', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });

    await renderCommissions();

    await waitFor(() =>
      expect(screen.getByText(/No commissions yet/i)).toBeInTheDocument(),
    );
  });

  test('shows error when commission load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Load failed' } },
    });

    await renderCommissions();

    await waitFor(() =>
      expect(screen.getByText(/Load failed/i)).toBeInTheDocument(),
    );
  });

  test('keeps last successful list when manual resync fails', async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: [
          {
            id: 'comm-stable-1',
            description: 'Stable commission',
            rewardAmount: 200,
            currency: 'USD',
            status: 'open',
            paymentStatus: 'escrowed',
          },
        ],
      })
      .mockRejectedValueOnce({
        response: { data: { message: 'Reload failed' } },
      });

    await renderCommissions();

    expect(screen.getByText(/Stable commission/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));

    await waitFor(() =>
      expect(screen.getByText(/Reload failed/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Stable commission/i)).toBeInTheDocument();
  });

  test('shows sign-in prompt instead of creation form for guests', async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      loading: false,
    });

    await renderCommissions();

    expect(screen.queryByText(/Create commission/i)).not.toBeInTheDocument();
    const signInLink = screen.getAllByRole('link', { name: /Sign in/i }).at(0);
    expect(signInLink).toHaveAttribute('href', '/login');
  });

  test('renders commission rewards and defaults', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [
        {
          id: 'comm-1',
          description: 'No reward yet',
          rewardAmount: null,
          currency: null,
          status: 'open',
          paymentStatus: 'pending',
        },
        {
          id: 'comm-2',
          description: 'Reward default currency',
          rewardAmount: 150,
          status: 'open',
          paymentStatus: 'escrowed',
        },
      ],
    });

    await renderCommissions();

    await waitFor(() =>
      expect(screen.getByText(/No reward yet/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('Reward: N/A')).toBeInTheDocument();
    expect(screen.getByText('Reward: 150 USD')).toBeInTheDocument();
  });

  test('renders commission detail', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        id: 'comm-1',
        description: 'Test commission',
        rewardAmount: 200,
        currency: 'USD',
        status: 'open',
        paymentStatus: 'escrowed',
        responses: [
          {
            id: 'resp-1',
            draftId: 'draft-1',
            draftTitle: 'Landing hero',
            studioId: 'studio-1',
            studioName: 'Nova Studio',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });

    await renderCommissionDetail('comm-1');
    await waitFor(() =>
      expect(screen.getByText(/Commission comm-1/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Responses/i)).toBeInTheDocument();
    expect(screen.getByText(/Landing hero/i)).toBeInTheDocument();
    expect(screen.getByText(/Response by: Nova Studio/i)).toBeInTheDocument();
  });

  test('shows error message when detail load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Detail load failed' } },
    });

    await renderCommissionDetail('comm-99');

    await waitFor(() =>
      expect(screen.getByText(/Detail load failed/i)).toBeInTheDocument(),
    );
  });

  test('shows reset action when active filters produce no matches', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [
        {
          id: 'comm-filter-1',
          description: 'Logo evolution set',
          rewardAmount: 100,
          currency: 'USD',
          status: 'released',
          paymentStatus: 'released',
        },
      ],
    });

    await renderCommissions();
    expect(screen.getByText(/Logo evolution set/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by keyword/i), {
      target: { value: 'storyboard' },
    });

    expect(await screen.findByText(/No results yet/i)).toBeInTheDocument();

    const resetButtons = screen.getAllByRole('button', {
      name: /Reset filters/i,
    });
    fireEvent.click(resetButtons.at(-1) as HTMLButtonElement);

    expect(screen.getByPlaceholderText(/Search by keyword/i)).toHaveValue('');
    expect(screen.getByText(/Logo evolution set/i)).toBeInTheDocument();
  });
});
