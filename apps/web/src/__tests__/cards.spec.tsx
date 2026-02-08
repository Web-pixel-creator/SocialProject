/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ChangeCard } from '../components/ChangeCard';
import { ProgressCard } from '../components/ProgressCard';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    unoptimized: _unoptimized,
    ...props
  }: {
    alt: string;
    unoptimized?: boolean;
  }) => <img alt={alt} {...props} />,
}));

describe('feed cards', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
  });

  test('renders change card details and copies deep link', async () => {
    render(
      <ChangeCard
        changeType="pr_merged"
        description="Merged a stronger CTA hierarchy."
        draftId="draft-123"
        draftTitle="Landing Refresh"
        glowUpScore={8.12}
        id="change-42"
        impactDelta={3}
        occurredAt="2026-02-08T12:00:00.000Z"
        severity="major"
      />,
    );

    expect(screen.getByText(/PR merged/i)).toBeInTheDocument();
    expect(screen.getByText(/major/i)).toBeInTheDocument();
    expect(screen.getByText(/Landing Refresh/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft draft-123/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact \+3/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp 8.1/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Copy link/i }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'http://localhost/drafts/draft-123?change=change-42',
      ),
    );
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open draft/i })).toHaveAttribute(
      'href',
      '/drafts/draft-123',
    );
  });

  test('renders fix request card fallback values', () => {
    render(
      <ChangeCard
        changeType="fix_request"
        description="Need better contrast in hero."
        draftId="draft-fix"
        draftTitle="Fix Draft"
        id="change-fix"
        occurredAt="not-a-date"
      />,
    );

    expect(screen.getByText(/Fix request/i)).toBeInTheDocument();
    expect(screen.queryByText(/Impact \+/i)).not.toBeInTheDocument();
    expect(screen.getByText(/GlowUp 0.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Just now/i)).toBeInTheDocument();
  });

  test('renders progress card with timeline details', () => {
    render(
      <ProgressCard
        afterImageUrl="https://example.com/after.png"
        authorStudio="Studio Nova"
        beforeImageUrl="https://example.com/before.png"
        draftId="draft-progress"
        glowUpScore={6.44}
        lastActivity="2026-02-08T15:00:00.000Z"
        prCount={5}
      />,
    );

    expect(screen.getByAltText(/Before draft draft-progress/i)).toBeInTheDocument();
    expect(screen.getByAltText(/After draft draft-progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Progress Chain/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp 6.4/i)).toBeInTheDocument();
    expect(screen.getByText(/PRs: 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Studio Nova/i)).toBeInTheDocument();
    expect(screen.getByText(/Last activity:/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft ID: draft-progress/i)).toBeInTheDocument();
  });

  test('omits last activity row when timestamp is missing', () => {
    render(
      <ProgressCard
        afterImageUrl="https://example.com/after-2.png"
        authorStudio="Studio Echo"
        beforeImageUrl="https://example.com/before-2.png"
        draftId="draft-no-activity"
        glowUpScore={2}
        prCount={1}
      />,
    );

    expect(screen.queryByText(/Last activity:/i)).not.toBeInTheDocument();
  });
});
