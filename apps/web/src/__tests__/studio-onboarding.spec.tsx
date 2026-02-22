/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import StudioOnboardingPage from '../app/studios/onboarding/page';
import { apiClient, setAgentAuth } from '../lib/api';

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
    (setAgentAuth as jest.Mock).mockReset();
    localStorage.clear();
  });

  const connectAgent = async ({
    agentId = 'agent-1',
    apiKey = 'key-1',
  }: {
    agentId?: string;
    apiKey?: string;
  } = {}) => {
    fireEvent.change(screen.getByLabelText(/Agent ID/i), {
      target: { value: agentId },
    });
    fireEvent.change(screen.getByLabelText(/API key/i), {
      target: { value: apiKey },
    });
    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/1. Connect your agent/i),
      ).not.toBeInTheDocument(),
    );
  };

  test('connects agent and shows profile step', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        studio_name: 'Studio Prime',
        avatar_url: 'https://example.com/avatar.png',
        style_tags: ['Editorial'],
      },
    });

    render(<StudioOnboardingPage />);

    await connectAgent();

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/studios/agent-1'),
    );
    expect(screen.getByText(/Studio profile/i)).toBeInTheDocument();
  });

  test('requires mandatory profile fields before save', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });

    render(<StudioOnboardingPage />);

    await connectAgent({ agentId: 'agent-2', apiKey: 'key-2' });

    fireEvent.click(screen.getByRole('button', { name: /Save profile/i }));

    await waitFor(() =>
      expect(
        screen.getByText(
          /Studio name, avatar, and at least one style tag are required/i,
        ),
      ).toBeInTheDocument(),
    );
  });

  test('restores agent credentials from local storage', () => {
    localStorage.setItem('finishit_agent_id', 'stored-agent');
    localStorage.setItem('finishit_agent_key', 'stored-key');

    render(<StudioOnboardingPage />);

    expect(screen.getByDisplayValue('stored-agent')).toBeInTheDocument();
    expect(screen.getByDisplayValue('stored-key')).toBeInTheDocument();
    expect(setAgentAuth).toHaveBeenCalledWith('stored-agent', 'stored-key');
  });

  test('requires credentials before connecting', async () => {
    render(<StudioOnboardingPage />);
    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    expect(
      await screen.findByText(/Agent ID and API key are required/i),
    ).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  test('shows connect error when profile fetch fails', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Studio profile unavailable' } },
    });

    render(<StudioOnboardingPage />);
    fireEvent.change(screen.getByLabelText(/Agent ID/i), {
      target: { value: 'agent-error' },
    });
    fireEvent.change(screen.getByLabelText(/API key/i), {
      target: { value: 'key-error' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    expect(
      await screen.findByText(/Studio profile unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/1. Connect your agent/i)).toBeInTheDocument();
  });

  test('saves profile, handles tags, and completes checklist step', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        studio_name: 'Studio Prime',
        avatar_url: 'https://example.com/avatar.png',
        style_tags: ['Editorial'],
        personality: 'Confident and clean.',
      },
    });
    (apiClient.put as jest.Mock).mockResolvedValueOnce({ data: { ok: true } });

    render(<StudioOnboardingPage />);
    await connectAgent();

    const profileCard = screen
      .getByRole('heading', { name: /2\. Studio profile/i })
      .closest('div');
    if (!profileCard) {
      throw new Error('Profile card not found');
    }
    const profileQueries = within(profileCard);

    const tagsInput = profileQueries.getByPlaceholderText(
      /Minimal, Editorial, Futuristic/i,
    );
    fireEvent.change(tagsInput, { target: { value: 'Futuristic' } });
    fireEvent.keyDown(tagsInput, { key: 'Enter' });
    expect(
      screen.getByRole('button', { name: /Futuristic/i }),
    ).toBeInTheDocument();

    fireEvent.change(tagsInput, { target: { value: 'Futuristic' } });
    fireEvent.keyDown(tagsInput, { key: 'Enter' });
    expect(screen.getAllByRole('button', { name: /Futuristic/i })).toHaveLength(
      1,
    );

    fireEvent.click(screen.getByRole('button', { name: /Editorial/i }));
    expect(screen.queryByRole('button', { name: /Editorial/i })).toBeNull();

    fireEvent.change(profileQueries.getByLabelText(/Studio name/i), {
      target: { value: '  Studio Prime Updated  ' },
    });
    fireEvent.change(profileQueries.getByLabelText(/Avatar URL/i), {
      target: { value: '  https://example.com/new-avatar.png  ' },
    });
    fireEvent.change(profileQueries.getByLabelText(/Personality/i), {
      target: { value: '  Precision-first  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save profile/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/studios/agent-1',
        {
          studioName: 'Studio Prime Updated',
          personality: 'Precision-first',
          avatarUrl: 'https://example.com/new-avatar.png',
          styleTags: ['Futuristic'],
        },
        {
          headers: {
            'x-agent-id': 'agent-1',
            'x-api-key': 'key-1',
          },
        },
      );
    });

    expect(await screen.findByText(/Profile saved/i)).toBeInTheDocument();
    expect(screen.getByText(/3. First actions checklist/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Create your first draft \(POST \/api\/drafts\)/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit profile/i }));
    expect(screen.getByText(/1. Connect your agent/i)).toBeInTheDocument();
  });

  test('saves role personas when persona fields are filled', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        studio_name: 'Studio Persona',
        avatar_url: 'https://example.com/avatar.png',
        style_tags: ['Editorial'],
      },
    });
    (apiClient.put as jest.Mock).mockResolvedValue({ data: { ok: true } });

    render(<StudioOnboardingPage />);
    await connectAgent();

    fireEvent.change(screen.getByLabelText(/Author tone/i), {
      target: { value: 'Narrative-first' },
    });
    fireEvent.change(screen.getByLabelText(/Author signature/i), {
      target: { value: 'Ship the arc.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save profile/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/studios/agent-1/personas',
        {
          rolePersonas: {
            author: {
              tone: 'Narrative-first',
              signaturePhrase: 'Ship the arc.',
            },
          },
        },
        {
          headers: {
            'x-agent-id': 'agent-1',
            'x-api-key': 'key-1',
          },
        },
      );
    });
  });

  test('shows error when profile save fails and supports skipping', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        studio_name: 'Studio Save Error',
        avatar_url: 'https://example.com/avatar.png',
        style_tags: ['Editorial'],
      },
    });
    (apiClient.put as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Save failed on API' } },
    });

    render(<StudioOnboardingPage />);
    await connectAgent({
      agentId: 'agent-save-error',
      apiKey: 'key-save-error',
    });

    fireEvent.click(screen.getByRole('button', { name: /Save profile/i }));
    expect(await screen.findByText(/Save failed on API/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Skip optional steps/i }),
    );
    expect(screen.getByText(/3. First actions checklist/i)).toBeInTheDocument();
  });
});
