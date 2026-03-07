/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ImageEditPanel } from '../components/ImageEditPanel';
import { apiClient } from '../lib/api';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === 'string' ? href : ''} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const t = (key: string) => key;

describe('ImageEditPanel', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockReset();
  });

  test('submits image edit jobs with selected source version and settings', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { id: 'job-1', status: 'queued' },
    });

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ImageEditPanel
          draftId="draft-1"
          t={t}
          versions={[
            { imageUrl: 'https://example.com/v1.png', versionNumber: 1 },
            { imageUrl: 'https://example.com/v2.png', versionNumber: 2 },
          ]}
        />
      </SWRConfig>,
    );

    fireEvent.change(screen.getByLabelText('draftDetail.imageEdit.promptLabel'), {
      target: { value: 'Tighten the logo spacing and boost contrast.' },
    });
    fireEvent.change(screen.getByLabelText('draftDetail.imageEdit.sourceVersionLabel'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('draftDetail.imageEdit.numImagesLabel'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('draftDetail.imageEdit.aspectRatioLabel'), {
      target: { value: '16:9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'draftDetail.imageEdit.create' }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/drafts/draft-1/image-edits', {
        aspectRatio: '16:9',
        numImages: 3,
        prompt: 'Tighten the logo spacing and boost contrast.',
        sourceVersionNumber: 2,
      }),
    );
  });

  test('promotes a candidate into the existing pull request flow', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: [
        {
          aspectRatio: null,
          candidates: [
            {
              id: 'candidate-1',
              imageUrl: 'https://example.com/candidate.png',
              metadata: {},
              position: 1,
              promotedPullRequestId: null,
              thumbnailUrl: 'https://example.com/candidate-thumb.png',
            },
          ],
          createdAt: '2026-03-07T12:00:00.000Z',
          failureMessage: null,
          id: 'job-1',
          numImages: 1,
          prompt: 'Make the CTA block cleaner.',
          sourceVersionNumber: 2,
          status: 'completed',
        },
      ],
    });
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { id: 'pr-1' } });

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ImageEditPanel
          draftId="draft-2"
          t={t}
          versions={[{ imageUrl: 'https://example.com/v2.png', versionNumber: 2 }]}
        />
      </SWRConfig>,
    );

    await waitFor(() =>
      expect(screen.getByText('draftDetail.imageEdit.candidateLabel #1')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('draftDetail.imageEdit.prDescriptionLabel'), {
      target: { value: 'Candidate is ready for a typography cleanup PR.' },
    });
    fireEvent.change(screen.getByLabelText('draftDetail.imageEdit.prSeverityLabel'), {
      target: { value: 'major' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'draftDetail.imageEdit.promote' }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/drafts/draft-2/image-edits/candidates/candidate-1/promote',
        {
          description: 'Candidate is ready for a typography cleanup PR.',
          severity: 'major',
        },
      ),
    );
  });
});
