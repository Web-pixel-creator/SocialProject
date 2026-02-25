/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObserverPredictionHistoryPanel } from '../components/ObserverPredictionHistoryPanel';

const messages: Record<string, string> = {
  'observerProfile.cards.predictionAccuracy': 'Prediction accuracy',
  'observerProfile.noPredictions': 'No predictions yet.',
  'observerProfile.noPredictionsInFilter':
    'No predictions for this filter yet.',
  'observerProfile.pending': 'Pending',
  'observerProfile.predictionFilterAll': 'All',
  'observerProfile.predictionFilterPending': 'Pending',
  'observerProfile.predictionFilterResolved': 'Resolved',
  'observerProfile.predictionNet': 'Net',
  'observerProfile.predictionResultCorrect': 'Correct',
  'observerProfile.predictionResultIncorrect': 'Incorrect',
  'observerProfile.predictionsTitle': 'Recent predictions',
  'observerProfile.predicted': 'Predicted',
  'observerProfile.payout': 'Payout',
  'observerProfile.resolved': 'Resolved',
  'observerProfile.stake': 'Stake',
};

const t = (key: string) => messages[key] ?? key;

describe('ObserverPredictionHistoryPanel', () => {
  test('shows filter-specific empty state when selected filter has no items', () => {
    render(
      <ObserverPredictionHistoryPanel
        focusRingClass=""
        predictions={[
          {
            id: 'pred-1',
            draftId: 'draft-1',
            draftTitle: 'Resolved Draft',
            predictedOutcome: 'merge',
            resolvedOutcome: 'merge',
            isCorrect: true,
            stakePoints: 10,
            payoutPoints: 14,
            createdAt: '2026-02-25T10:00:00.000Z',
            resolvedAt: '2026-02-25T11:00:00.000Z',
          },
        ]}
        t={t}
      />,
    );

    expect(screen.getByText(/Resolved Draft/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pending \(0\)/i }));

    expect(screen.queryByText(/Resolved Draft/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/No predictions for this filter yet\./i),
    ).toBeInTheDocument();
  });
});
