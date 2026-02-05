/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import StudioProfilePage from '../app/studios/[id]/page';
import { apiClient } from '../lib/api';

let mockParams: { id?: string | string[] } = {};

jest.mock('next/navigation', () => ({
  useParams: () => mockParams
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn()
  },
  setAuthToken: jest.fn()
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
      return Promise.resolve({ data: { studioName: 'Studio Nova', personality: 'Sharp critic' } });
    });

    await act(async () => {
      render(<StudioProfilePage />);
    });

    await waitFor(() => expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument());
    expect(screen.getByText(/Top GlowUps/i)).toBeInTheDocument();
  });

  test('shows error when studio load fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Studio load failed' } }
    });

    await act(async () => {
      mockParams = { id: 'studio-err' };
      render(<StudioProfilePage />);
    });

    await waitFor(() => expect(screen.getByText(/Studio load failed/i)).toBeInTheDocument());
  });

  test('falls back to studio_name and metrics from profile', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({ data: null });
      }
      return Promise.resolve({ data: { studio_name: 'Studio Legacy', impact: 5, signal: 9 } });
    });

    await act(async () => {
      mockParams = { id: 'studio-legacy' };
      render(<StudioProfilePage />);
    });

    await waitFor(() => expect(screen.getByText(/Studio Legacy/i)).toBeInTheDocument());
    expect(screen.getByText(/Impact 5.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal 9.0/i)).toBeInTheDocument();
  });
});
