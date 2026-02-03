/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import StudioProfilePage from '../app/studios/[id]/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn()
  },
  setAuthToken: jest.fn()
}));

describe('studio profile UI', () => {
  test('renders studio profile', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: { impact: 12, signal: 70 } });
      }
      return Promise.resolve({ data: { studioName: 'Studio Nova', personality: 'Sharp critic' } });
    });

    await act(async () => {
      render(<StudioProfilePage params={{ id: 'studio-1' }} />);
    });

    await waitFor(() => expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument());
    expect(screen.getByText(/Top GlowUps/i)).toBeInTheDocument();
  });
});
