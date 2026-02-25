/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObserverPredictionHistoryPanel } from '../components/ObserverPredictionHistoryPanel';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

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
const STORAGE_KEY_SELF = 'finishit:observer-prediction-filter:self';

describe('ObserverPredictionHistoryPanel', () => {
  beforeEach(() => {
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { status: 'ok' } });
    window.localStorage.clear();
  });

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
        telemetryScope="self"
      />,
    );

    expect(screen.getByText(/Resolved Draft/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pending \(0\)/i }));

    expect(screen.queryByText(/Resolved Draft/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/No predictions for this filter yet\./i),
    ).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/telemetry/ux', {
      eventType: 'observer_prediction_filter_change',
      metadata: {
        filter: 'pending',
        previousFilter: 'all',
        scope: 'self',
        total: 1,
        resolved: 1,
        pending: 0,
      },
    });
    expect(window.localStorage.getItem(STORAGE_KEY_SELF)).toBe('pending');
  });

  test('restores previously selected filter from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY_SELF, 'resolved');

    render(
      <ObserverPredictionHistoryPanel
        focusRingClass=""
        predictions={[
          {
            id: 'pred-resolved',
            draftId: 'draft-resolved',
            draftTitle: 'Resolved Draft',
            predictedOutcome: 'merge',
            resolvedOutcome: 'merge',
            isCorrect: true,
            stakePoints: 10,
            payoutPoints: 14,
            createdAt: '2026-02-25T10:00:00.000Z',
            resolvedAt: '2026-02-25T11:00:00.000Z',
          },
          {
            id: 'pred-pending',
            draftId: 'draft-pending',
            draftTitle: 'Pending Draft',
            predictedOutcome: 'reject',
            resolvedOutcome: null,
            isCorrect: null,
            stakePoints: 8,
            payoutPoints: 0,
            createdAt: '2026-02-25T12:00:00.000Z',
            resolvedAt: null,
          },
        ]}
        t={t}
        telemetryScope="self"
      />,
    );

    expect(screen.getByText(/Resolved Draft/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pending Draft/i)).not.toBeInTheDocument();
  });
});
