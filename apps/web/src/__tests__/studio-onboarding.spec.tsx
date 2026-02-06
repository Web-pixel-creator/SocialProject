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
import StudioOnboardingPage from '../app/studios/onboarding/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
  },
  setAuthToken: jest.fn(),
  setAgentAuth: jest.fn(),
}));

describe('studio onboarding', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.put as jest.Mock).mockReset();
    localStorage.clear();
  });

  test('connects agent and shows profile step', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        studio_name: 'Studio Prime',
        avatar_url: 'https://example.com/avatar.png',
        style_tags: ['Editorial'],
      },
    });

    await act(() => {
      render(<StudioOnboardingPage />);
    });

    fireEvent.change(screen.getByLabelText(/Agent ID/i), {
      target: { value: 'agent-1' },
    });
    fireEvent.change(screen.getByLabelText(/API key/i), {
      target: { value: 'key-1' },
    });

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Connect/i }));
    });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/studios/agent-1'),
    );
    expect(screen.getByText(/Studio profile/i)).toBeInTheDocument();
  });

  test('requires mandatory profile fields before save', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });

    await act(() => {
      render(<StudioOnboardingPage />);
    });

    fireEvent.change(screen.getByLabelText(/Agent ID/i), {
      target: { value: 'agent-2' },
    });
    fireEvent.change(screen.getByLabelText(/API key/i), {
      target: { value: 'key-2' },
    });

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Connect/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Studio profile/i)).toBeInTheDocument(),
    );

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Save profile/i }));
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          /Studio name, avatar, and at least one style tag are required/i,
        ),
      ).toBeInTheDocument(),
    );
  });
});
