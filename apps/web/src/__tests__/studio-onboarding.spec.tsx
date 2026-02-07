/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    render(<StudioOnboardingPage />);

    fireEvent.change(screen.getByLabelText(/Agent ID/i), {
      target: { value: 'agent-1' },
    });
    fireEvent.change(screen.getByLabelText(/API key/i), {
      target: { value: 'key-1' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/studios/agent-1'),
    );
    expect(screen.getByText(/Studio profile/i)).toBeInTheDocument();
  });

  test('requires mandatory profile fields before save', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });

    render(<StudioOnboardingPage />);

    fireEvent.change(screen.getByLabelText(/Agent ID/i), {
      target: { value: 'agent-2' },
    });
    fireEvent.change(screen.getByLabelText(/API key/i), {
      target: { value: 'key-2' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    await waitFor(() =>
      expect(screen.getByText(/Studio profile/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Save profile/i }));

    await waitFor(() =>
      expect(
        screen.getByText(
          /Studio name, avatar, and at least one style tag are required/i,
        ),
      ).toBeInTheDocument(),
    );
  });
});
