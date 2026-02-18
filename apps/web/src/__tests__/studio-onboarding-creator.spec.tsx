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
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  setAuthToken: jest.fn(),
  setAgentAuth: jest.fn(),
}));

describe('creator toolkit onboarding section', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.put as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.patch as jest.Mock).mockReset();
    localStorage.clear();
  });

  const creatorQueries = () => {
    const section = screen
      .getByRole('heading', { name: /Creator toolkit onboarding/i })
      .closest('section');
    if (!section) {
      throw new Error('Creator onboarding section not found');
    }
    return within(section);
  };

  test('creates creator studio profile and advances to governance step', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        id: 'creator-studio-1',
        studioName: 'Creator Studio One',
        onboardingStep: 'profile',
        status: 'draft',
      },
    });

    render(<StudioOnboardingPage />);

    fireEvent.change(creatorQueries().getByLabelText(/Creator studio name/i), {
      target: { value: '  Creator Studio One  ' },
    });
    fireEvent.change(creatorQueries().getByLabelText(/^Tagline$/i), {
      target: { value: '  Human-led workflows  ' },
    });

    fireEvent.click(
      creatorQueries().getByRole('button', { name: /Create creator studio/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/creator-studios', {
        studioName: 'Creator Studio One',
        tagline: 'Human-led workflows',
        stylePreset: 'balanced',
        revenueSharePercent: 15,
      });
    });

    await waitFor(() => {
      expect(
        creatorQueries().getByLabelText(/Auto-approve threshold/i),
      ).toBeInTheDocument();
    });
    expect(creatorQueries().getByText(/Step 2\/4/i)).toBeInTheDocument();
    expect(localStorage.getItem('finishit_creator_studio_id')).toBe(
      'creator-studio-1',
    );
  });

  test('saves governance, activates toolkit, and loads funnel summary', async () => {
    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          id: 'creator-studio-2',
          studioName: 'Creator Studio Two',
          onboardingStep: 'profile',
          status: 'draft',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'creator-studio-2',
          studioName: 'Creator Studio Two',
          onboardingStep: 'ready',
          status: 'active',
        },
      });

    (apiClient.patch as jest.Mock).mockResolvedValueOnce({
      data: {
        id: 'creator-studio-2',
        onboardingStep: 'governance',
        status: 'draft',
      },
    });

    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        windowDays: 30,
        created: 10,
        profileCompleted: 8,
        governanceConfigured: 7,
        billingConnected: 6,
        activated: 5,
        retentionPing: 3,
        activationRatePercent: 50,
      },
    });

    render(<StudioOnboardingPage />);

    fireEvent.change(creatorQueries().getByLabelText(/Creator studio name/i), {
      target: { value: 'Creator Studio Two' },
    });
    fireEvent.click(
      creatorQueries().getByRole('button', { name: /Create creator studio/i }),
    );

    await waitFor(() => {
      expect(
        creatorQueries().getByLabelText(/Auto-approve threshold/i),
      ).toBeInTheDocument();
    });

    fireEvent.change(
      creatorQueries().getByLabelText(/Auto-approve threshold/i),
      {
        target: { value: '0.8' },
      },
    );
    fireEvent.change(creatorQueries().getByLabelText(/Moderation mode/i), {
      target: { value: 'strict' },
    });

    fireEvent.click(
      creatorQueries().getByRole('button', { name: /Save governance/i }),
    );

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/creator-studios/creator-studio-2/governance',
        {
          governance: {
            autoApproveThreshold: 0.8,
            majorPrRequiresHuman: true,
            allowForks: true,
            moderationMode: 'strict',
          },
          revenueSharePercent: 15,
        },
      );
    });

    await waitFor(() => {
      expect(
        creatorQueries().getByLabelText(/Billing provider account ID/i),
      ).toBeInTheDocument();
    });

    fireEvent.change(
      creatorQueries().getByLabelText(
        /Billing provider account ID \(optional\)/i,
      ),
      {
        target: { value: 'acct_123' },
      },
    );

    fireEvent.click(
      creatorQueries().getByRole('button', {
        name: /Activate creator toolkit/i,
      }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenNthCalledWith(
        2,
        '/creator-studios/creator-studio-2/billing/connect',
        {
          providerAccountId: 'acct_123',
        },
      );
      expect(apiClient.get).toHaveBeenCalledWith(
        '/creator-studios/funnels/summary',
        {
          params: { windowDays: 30 },
        },
      );
    });

    expect(creatorQueries().getByText(/Funnel \(30d\)/i)).toBeInTheDocument();
    expect(
      creatorQueries().getByText(/Activation rate: 50\.00%/i),
    ).toBeInTheDocument();
  });
});
