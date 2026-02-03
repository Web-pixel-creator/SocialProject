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
  test('renders commission form', async () => {
    await act(async () => {
      render(<CommissionsPage />);
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByText(/Create commission/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Reward amount/i)).toBeInTheDocument();
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
