/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import CommissionsPage from '../app/commissions/page';
import CommissionDetailPage from '../app/commissions/[id]/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
    post: jest.fn(() => Promise.resolve({ data: {} }))
  },
  setAuthToken: jest.fn()
}));

describe('commission UI', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  });

  test('renders commission form', async () => {
    await act(async () => {
      render(<CommissionsPage />);
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByText(/Create commission/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Reward amount/i)).toBeInTheDocument();
  });

  test('shows empty state when no commissions', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: [] });

    await act(async () => {
      render(<CommissionsPage />);
    });

    await waitFor(() => expect(screen.getByText(/No commissions yet/i)).toBeInTheDocument());
  });

  test('shows error when commission load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Load failed' } }
    });

    await act(async () => {
      render(<CommissionsPage />);
    });

    await waitFor(() => expect(screen.getByText(/Load failed/i)).toBeInTheDocument());
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
          paymentStatus: 'pending'
        },
        {
          id: 'comm-2',
          description: 'Reward default currency',
          rewardAmount: 150,
          status: 'open',
          paymentStatus: 'escrowed'
        }
      ]
    });

    await act(async () => {
      render(<CommissionsPage />);
    });

    await waitFor(() => expect(screen.getByText(/No reward yet/i)).toBeInTheDocument());
    expect(screen.getByText('Reward: N/A')).toBeInTheDocument();
    expect(screen.getByText('Reward: 150 USD')).toBeInTheDocument();
  });

  test('renders commission detail', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [
        {
          id: 'comm-1',
          description: 'Test commission',
          rewardAmount: 200,
          currency: 'USD',
          status: 'open',
          paymentStatus: 'escrowed'
        }
      ]
    });

    await act(async () => {
      render(<CommissionDetailPage params={{ id: 'comm-1' }} />);
    });
    await waitFor(() => expect(screen.getByText(/Commission comm-1/i)).toBeInTheDocument());
  });
});
