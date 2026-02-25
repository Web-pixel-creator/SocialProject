/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BattleCard } from '../components/BattleCard';
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
  }) => <div aria-label={alt} role="img" {...props} />,
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
        provenance={{
          authenticityStatus: 'verified',
          humanSparkScore: 88,
          humanBriefPresent: true,
          agentStepCount: 3,
        }}
        severity="major"
      />,
    );

    expect(screen.getByText(/PR merged/i)).toBeInTheDocument();
    expect(screen.getByText(/major/i)).toBeInTheDocument();
    expect(screen.getByText(/Landing Refresh/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft ID:\s*draft-123/i)).toBeInTheDocument();
    expect(screen.getByText(/Impact \+3/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp 8.1/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Human spark 88/i)).toBeInTheDocument();
    expect(screen.getByText(/Mini-thread/i)).toBeInTheDocument();
    expect(screen.getByText(/Author decision: Merged/i)).toBeInTheDocument();

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

    expect(screen.getByText(/^Fix request$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Impact \+/i)).not.toBeInTheDocument();
    expect(screen.getByText(/GlowUp 0.0/i)).toBeInTheDocument();
    expect(screen.getByText(/Just now/i)).toBeInTheDocument();
  });

  test('uses "Just now" when timestamp is not provided', () => {
    render(
      <ChangeCard
        changeType="fix_request"
        description="Missing timestamp on event."
        draftId="draft-no-time"
        draftTitle="No Time Draft"
        id="change-no-time"
      />,
    );

    expect(screen.getByText(/Just now/i)).toBeInTheDocument();
  });

  test('shows copy failure feedback when clipboard write fails', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.reject(new Error('write failed'))),
      },
    });

    render(
      <ChangeCard
        changeType="pr_merged"
        description="Copy fallback scenario."
        draftId="draft-copy-fail"
        draftTitle="Copy Fail Draft"
        id="change-copy-fail"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Copy link/i }));

    expect(await screen.findByText('Copy failed')).toBeInTheDocument();
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

    expect(
      screen.getByRole('img', { name: /Before draft draft-progress/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /After draft draft-progress/i }),
    ).toBeInTheDocument();
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

  test('updates battle vote split and marks user vote', () => {
    render(
      <BattleCard
        decision="pending"
        fixCount={5}
        glowUpScore={9.2}
        id="battle-vote"
        leftLabel="Studio A"
        leftVote={55}
        prCount={4}
        provenance={{
          authenticityStatus: 'metadata_only',
          humanSparkScore: 21,
          humanBriefPresent: false,
          agentStepCount: 2,
        }}
        rightLabel="Studio B"
        rightVote={45}
        title="PR Battle: Studio A vs Studio B"
      />,
    );

    expect(screen.getByText(/Studio A 55%/i)).toBeInTheDocument();
    expect(screen.getByText(/Traceable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Vote Studio A/i }));
    expect(screen.getByText(/Your vote: Studio A/i)).toBeInTheDocument();
    expect(screen.getByText(/Studio A 56%/i)).toBeInTheDocument();
  });

  test('shows provenance spark in compact battle card', () => {
    render(
      <BattleCard
        compact
        decision="pending"
        fixCount={4}
        glowUpScore={6.2}
        id="battle-compact-spark"
        leftLabel="Studio Left"
        leftVote={51}
        prCount={3}
        provenance={{
          authenticityStatus: 'unverified',
          humanSparkScore: 13,
          humanBriefPresent: false,
          agentStepCount: 1,
        }}
        rightLabel="Studio Right"
        rightVote={49}
        title="Compact battle"
      />,
    );

    expect(screen.getByText(/Human spark 13/i)).toBeInTheDocument();
    expect(screen.getByText(/Unverified/i)).toBeInTheDocument();
  });

  test('shows reason when battle prediction is blocked by daily submission cap', () => {
    render(
      <BattleCard
        decision="pending"
        fixCount={2}
        glowUpScore={7.5}
        id="battle-prediction-limit"
        leftLabel="Design"
        leftVote={52}
        onPredict={jest.fn()}
        prCount={3}
        predictionState={{
          dailyStakeCapPoints: 200,
          dailyStakeUsedPoints: 40,
          dailySubmissionCap: 1,
          dailySubmissionsUsed: 1,
          latestOutcome: null,
          maxStakePoints: 100,
          minStakePoints: 5,
          pending: false,
        }}
        rightLabel="Function"
        rightVote={48}
        title="PR Battle: Daily cap test"
      />,
    );

    expect(
      screen.getByRole('button', { name: /Predict merge/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Predict reject/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Daily prediction submission cap reached/i),
    ).toBeInTheDocument();
  });

  test('applies quick stake presets in battle prediction controls', () => {
    render(
      <BattleCard
        decision="pending"
        fixCount={2}
        glowUpScore={7.1}
        id="battle-prediction-presets"
        leftLabel="Design"
        leftVote={52}
        onPredict={jest.fn()}
        prCount={3}
        predictionState={{
          dailyStakeCapPoints: 250,
          dailyStakeUsedPoints: 40,
          dailySubmissionCap: 10,
          dailySubmissionsUsed: 2,
          latestOutcome: null,
          maxStakePoints: 100,
          minStakePoints: 5,
          pending: false,
        }}
        rightLabel="Function"
        rightVote={48}
        title="PR Battle: Stake presets test"
      />,
    );

    expect(screen.getByText(/Stake 5-100 FIN/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Stake 100$/i }));
    expect(screen.getByLabelText(/^Stake$/i)).toHaveValue(100);

    fireEvent.click(screen.getByRole('button', { name: /^Stake 5$/i }));
    expect(screen.getByLabelText(/^Stake$/i)).toHaveValue(5);
  });

  test('clamps out-of-range stake input and shows adjustment hint', () => {
    render(
      <BattleCard
        decision="pending"
        fixCount={2}
        glowUpScore={7.1}
        id="battle-prediction-clamp"
        leftLabel="Design"
        leftVote={52}
        onPredict={jest.fn()}
        prCount={3}
        predictionState={{
          dailyStakeCapPoints: 250,
          dailyStakeUsedPoints: 40,
          dailySubmissionCap: 10,
          dailySubmissionsUsed: 2,
          latestOutcome: null,
          maxStakePoints: 100,
          minStakePoints: 5,
          pending: false,
        }}
        rightLabel="Function"
        rightVote={48}
        title="PR Battle: Stake clamp test"
      />,
    );

    const stakeInput = screen.getByLabelText(/^Stake$/i);
    fireEvent.change(stakeInput, { target: { value: '500' } });

    expect(stakeInput).toHaveValue(100);
    expect(
      screen.getByText(/Stake was adjusted to allowed range:\s*5-100 FIN\./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Stake 5$/i }));
    expect(
      screen.queryByText(/Stake was adjusted to allowed range:\s*5-100 FIN\./i),
    ).not.toBeInTheDocument();
  });
});
