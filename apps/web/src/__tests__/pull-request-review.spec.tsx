/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PullRequestReviewPage from '../app/pull-requests/[id]/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('pull request review page', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockReset();
  });

  const renderReviewPage = async (id: string) => {
    render(<PullRequestReviewPage params={{ id }} />);
    await waitFor(() =>
      expect(
        screen.queryByText(/Loading pull request/i),
      ).not.toBeInTheDocument(),
    );
  };

  test('renders review data and metrics', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/pull-requests/')) {
        return Promise.resolve({
          data: {
            pullRequest: {
              id: 'pr-1',
              draftId: 'draft-1',
              makerId: 'maker-1',
              proposedVersion: 2,
              description: 'Improve layout',
              severity: 'minor',
              status: 'pending',
              addressedFixRequests: ['fix-1'],
            },
            draft: {
              id: 'draft-1',
              authorId: 'author-1',
              status: 'draft',
              currentVersion: 1,
              glowUpScore: 2.5,
            },
            authorStudio: 'Studio A',
            makerStudio: 'Studio B',
            beforeImageUrl: 'before.png',
            afterImageUrl: 'after.png',
            metrics: {
              currentGlowUp: 2.5,
              predictedGlowUp: 3.5,
              glowUpDelta: 1.0,
              impactDelta: 3,
            },
          },
        });
      }
      return Promise.resolve({
        data: [
          {
            id: 'fix-1',
            category: 'Layout',
            description: 'Fix spacing',
            criticId: 'critic-1',
          },
          {
            id: 'fix-2',
            category: 'Color',
            description: 'Adjust palette',
            criticId: 'critic-2',
          },
        ],
      });
    });

    await renderReviewPage('pr-1');

    await waitFor(() =>
      expect(screen.getByText(/PR Review/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Studio B\s+→\s+Studio A/i)).toBeInTheDocument();
    expect(screen.getByText(/Improve layout/i)).toBeInTheDocument();
    expect(screen.getByText(/Current GlowUp/i)).toBeInTheDocument();
    expect(screen.getByText(/Predicted GlowUp/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact .*maker/i)).toBeInTheDocument();
    expect(screen.getByText(/Fix spacing/i)).toBeInTheDocument();
    expect(screen.queryByText(/Adjust palette/i)).toBeNull();
  });

  test('requires rejection reason', async () => {
    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/pull-requests/')) {
        return Promise.resolve({
          data: {
            pullRequest: {
              id: 'pr-2',
              draftId: 'draft-2',
              makerId: 'maker-2',
              proposedVersion: 2,
              description: 'Improve color',
              severity: 'minor',
              status: 'pending',
              addressedFixRequests: [],
            },
            draft: {
              id: 'draft-2',
              authorId: 'author-2',
              status: 'draft',
              currentVersion: 1,
              glowUpScore: 1.2,
            },
            authorStudio: 'Studio A',
            makerStudio: 'Studio B',
            beforeImageUrl: 'before.png',
            afterImageUrl: 'after.png',
            metrics: {
              currentGlowUp: 1.2,
              predictedGlowUp: 2.2,
              glowUpDelta: 1.0,
              impactDelta: 3,
            },
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    await renderReviewPage('pr-2');

    const rejectButton = await screen.findByRole('button', { name: /Reject/i });
    fireEvent.click(rejectButton);

    await waitFor(() =>
      expect(
        screen.getByText(/Rejection reason is required/i),
      ).toBeInTheDocument(),
    );
  });
});
