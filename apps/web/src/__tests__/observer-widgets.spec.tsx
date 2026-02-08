/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { DraftArcCard } from '../components/DraftArcCard';
import { DraftRecapPanel } from '../components/DraftRecapPanel';
import { ObserverDigestPanel } from '../components/ObserverDigestPanel';
import { PredictionWidget } from '../components/PredictionWidget';

describe('observer widgets', () => {
  test('renders draft arc summary', () => {
    render(
      <DraftArcCard
        summary={{
          draftId: 'draft-1',
          state: 'ready_for_review',
          latestMilestone: 'PR pending review',
          fixOpenCount: 2,
          prPendingCount: 1,
          lastMergeAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:05:00.000Z',
        }}
      />,
    );

    expect(screen.getByText(/Draft Arc/i)).toBeInTheDocument();
    expect(screen.getByText(/PR pending review/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Fixes/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('renders recap empty state', () => {
    render(
      <DraftRecapPanel
        recap={{
          fixRequests: 0,
          prSubmitted: 0,
          prMerged: 0,
          prRejected: 0,
          glowUpDelta: null,
          hasChanges: false,
        }}
      />,
    );

    expect(screen.getByText(/No changes in 24h/i)).toBeInTheDocument();
    expect(screen.getByText(/GlowUp delta unavailable/i)).toBeInTheDocument();
  });

  test('marks digest item as seen', () => {
    const onMarkSeen = jest.fn();
    render(
      <ObserverDigestPanel
        entries={[
          {
            id: 'entry-1',
            observerId: 'obs-1',
            draftId: 'draft-1',
            title: 'New PR on watched draft',
            summary: 'A PR was submitted.',
            latestMilestone: 'PR pending review',
            isSeen: false,
            createdAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
          },
        ]}
        onMarkSeen={onMarkSeen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mark seen/i }));
    expect(onMarkSeen).toHaveBeenCalledWith('entry-1');
    expect(screen.getByText(/Unseen 1/i)).toBeInTheDocument();
  });

  test('submits prediction choice', () => {
    const onPredict = jest.fn();
    render(
      <PredictionWidget
        onPredict={onPredict}
        summary={{
          pullRequestId: 'pr-12345678',
          pullRequestStatus: 'pending',
          consensus: { merge: 2, reject: 1, total: 3 },
          observerPrediction: null,
          accuracy: { correct: 4, total: 8, rate: 0.5 },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Predict merge/i }));
    expect(onPredict).toHaveBeenCalledWith('merge');
    expect(screen.getByText(/Your accuracy: 4\/8/i)).toBeInTheDocument();
  });

  test('submits reject prediction and shows resolved status', () => {
    const onPredict = jest.fn();
    render(
      <PredictionWidget
        onPredict={onPredict}
        summary={{
          pullRequestId: 'pr-87654321',
          pullRequestStatus: 'pending',
          consensus: { merge: 5, reject: 6, total: 11 },
          observerPrediction: {
            predictedOutcome: 'reject',
            resolvedOutcome: 'reject',
            isCorrect: true,
          },
          accuracy: { correct: 9, total: 10, rate: 0.9 },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Predict reject/i }));
    expect(onPredict).toHaveBeenCalledWith('reject');
    expect(screen.getByText(/Your prediction: reject/i)).toBeInTheDocument();
    expect(screen.getByText(/resolved reject/i)).toBeInTheDocument();
  });

  test('renders error state when summary fetch fails', () => {
    render(
      <PredictionWidget
        onPredict={jest.fn()}
        summary={null}
        error="Prediction service unavailable"
      />,
    );

    expect(
      screen.getByText(/Prediction service unavailable/i),
    ).toBeInTheDocument();
  });

  test('renders loading state while prediction summary is fetching', () => {
    render(<PredictionWidget onPredict={jest.fn()} summary={null} loading />);

    expect(screen.getByText(/Loading prediction/i)).toBeInTheDocument();
  });

  test('renders auth-required state for non-observer', () => {
    render(
      <PredictionWidget onPredict={jest.fn()} summary={null} authRequired />,
    );

    expect(
      screen.getByText(/Sign in as observer to submit predictions/i),
    ).toBeInTheDocument();
  });

  test('renders empty state with no pending pr', () => {
    render(<PredictionWidget onPredict={jest.fn()} summary={null} />);

    expect(screen.getByText(/No pending PR for prediction/i)).toBeInTheDocument();
  });
});
