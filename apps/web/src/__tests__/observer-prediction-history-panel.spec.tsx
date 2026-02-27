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
  'observerProfile.predictionHistoryShowing': 'Showing',
  'observerProfile.predictionHistoryFilterLabel': 'Filter',
  'observerProfile.predictionHistorySortLabel': 'Sort',
  'observerProfile.predictionHistoryRisk': 'Risk',
  'observerProfile.predictionOutcomeGap': 'Outcome gap',
  'observerProfile.pending': 'Pending',
  'observerProfile.predictionFilterAll': 'All',
  'observerProfile.predictionFilterPending': 'Pending',
  'observerProfile.predictionFilterResolved': 'Resolved',
  'observerProfile.predictionViewReset': 'Reset view',
  'observerProfile.predictionNet': 'Net',
  'observerProfile.health.healthy': 'Healthy',
  'observerProfile.health.critical': 'Critical',
  'observerProfile.health.unknown': 'n/a',
  'observerProfile.predictionOutcomeMerge': 'Merge',
  'observerProfile.predictionOutcomeReject': 'Reject',
  'observerProfile.predictionResultCorrect': 'Correct',
  'observerProfile.predictionResultIncorrect': 'Incorrect',
  'observerProfile.predictionsTitle': 'Recent predictions',
  'observerProfile.predicted': 'Predicted',
  'observerProfile.payout': 'Payout',
  'observerProfile.resolved': 'Resolved',
  'observerProfile.stake': 'Stake',
  'search.sort.recency': 'Recency',
};

const t = (key: string) => messages[key] ?? key;
const STORAGE_KEY_SELF = 'finishit:observer-prediction-filter:self';
const SORT_STORAGE_KEY_SELF = 'finishit:observer-prediction-sort:self';

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
    expect(
      screen.getByText(/Predicted:\s*Merge\s*\|\s*Resolved:\s*Merge/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Showing:\s*1\/1\s*\|\s*Filter:\s*All\s*\|\s*Sort:\s*Recency/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Resolved:\s*1\s*\|\s*Pending:\s*0\s*\|\s*Prediction accuracy:\s*100%\s*\|\s*Net:\s*\+4/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Risk:\s*n\/a/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Merge\s*Prediction accuracy:\s*100%\s*\(1\/1\)\s*\|\s*Reject\s*Prediction accuracy:\s*n\/a\s*\|\s*Stake\s*~\s*10\s*\|\s*Outcome gap:\s*n\/a/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pending \(0\)/i }));

    expect(screen.queryByText(/Resolved Draft/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/No predictions for this filter yet\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Showing:\s*0\/1\s*\|\s*Filter:\s*Pending\s*\|\s*Sort:\s*Recency/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Risk:\s*n\/a/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Merge\s*Prediction accuracy:\s*n\/a\s*\|\s*Reject\s*Prediction accuracy:\s*n\/a\s*\|\s*Stake\s*~\s*0\s*\|\s*Outcome gap:\s*n\/a/i,
      ),
    ).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'observer_prediction_filter_change',
        metadata: expect.objectContaining({
          filter: 'pending',
          previousFilter: 'all',
          scope: 'self',
          total: 1,
          resolved: 1,
          pending: 0,
          activeFilter: 'pending',
          activeSort: 'recent',
          filteredTotal: 0,
          filteredResolved: 0,
          filteredPending: 0,
          filteredAccuracyRate: 0,
          filteredNetPoints: 0,
          filteredRiskLevel: 'unknown',
        }),
      }),
    );
    expect(window.localStorage.getItem(STORAGE_KEY_SELF)).toBe('pending');

    fireEvent.click(screen.getByRole('button', { name: /Net/i }));
    expect(
      screen.getByText(
        /Showing:\s*0\/1\s*\|\s*Filter:\s*Pending\s*\|\s*Sort:\s*Net/i,
      ),
    ).toBeInTheDocument();

    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'observer_prediction_sort_change',
        metadata: expect.objectContaining({
          sort: 'net_desc',
          previousSort: 'recent',
          scope: 'self',
          total: 1,
          resolved: 1,
          pending: 0,
          activeFilter: 'pending',
          activeSort: 'net_desc',
          filteredTotal: 0,
          filteredResolved: 0,
          filteredPending: 0,
          filteredAccuracyRate: 0,
          filteredNetPoints: 0,
          filteredRiskLevel: 'unknown',
        }),
      }),
    );
    expect(window.localStorage.getItem(SORT_STORAGE_KEY_SELF)).toBe('net_desc');
  });

  test('resets filter and sort preferences back to defaults', () => {
    window.localStorage.setItem(STORAGE_KEY_SELF, 'pending');
    window.localStorage.setItem(SORT_STORAGE_KEY_SELF, 'stake_desc');

    render(
      <ObserverPredictionHistoryPanel
        focusRingClass=""
        predictions={[
          {
            id: 'pred-reset',
            draftId: 'draft-reset',
            draftTitle: 'Reset Draft',
            predictedOutcome: 'merge',
            resolvedOutcome: 'merge',
            isCorrect: true,
            stakePoints: 10,
            payoutPoints: 15,
            createdAt: '2026-02-25T10:00:00.000Z',
            resolvedAt: '2026-02-25T11:00:00.000Z',
          },
        ]}
        t={t}
        telemetryScope="self"
      />,
    );

    const resetButton = screen.getByRole('button', { name: /Reset view/i });
    expect(resetButton).not.toBeDisabled();
    expect(screen.queryByText(/Reset Draft/i)).not.toBeInTheDocument();

    fireEvent.click(resetButton);

    expect(screen.getByText(/Reset Draft/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY_SELF)).toBe('all');
    expect(window.localStorage.getItem(SORT_STORAGE_KEY_SELF)).toBe('recent');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'observer_prediction_filter_change',
        metadata: expect.objectContaining({
          filter: 'all',
          previousFilter: 'pending',
          activeFilter: 'all',
          activeSort: 'recent',
        }),
      }),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'observer_prediction_sort_change',
        metadata: expect.objectContaining({
          sort: 'recent',
          previousSort: 'stake_desc',
          activeFilter: 'all',
          activeSort: 'recent',
        }),
      }),
    );
    expect(resetButton).toBeDisabled();
  });

  test('restores previously selected filter from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY_SELF, 'resolved');
    window.localStorage.setItem(SORT_STORAGE_KEY_SELF, 'stake_desc');

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
    expect(screen.getByRole('button', { name: /Stake/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('shows healthy risk when resolved sample is sufficient', () => {
    render(
      <ObserverPredictionHistoryPanel
        focusRingClass=""
        predictions={[
          {
            id: 'pred-1',
            draftId: 'draft-1',
            draftTitle: 'Draft A',
            predictedOutcome: 'merge',
            resolvedOutcome: 'merge',
            isCorrect: true,
            stakePoints: 12,
            payoutPoints: 18,
            createdAt: '2026-02-25T10:00:00.000Z',
            resolvedAt: '2026-02-25T11:00:00.000Z',
          },
          {
            id: 'pred-2',
            draftId: 'draft-2',
            draftTitle: 'Draft B',
            predictedOutcome: 'reject',
            resolvedOutcome: 'reject',
            isCorrect: true,
            stakePoints: 9,
            payoutPoints: 15,
            createdAt: '2026-02-25T08:00:00.000Z',
            resolvedAt: '2026-02-25T09:00:00.000Z',
          },
          {
            id: 'pred-3',
            draftId: 'draft-3',
            draftTitle: 'Draft C',
            predictedOutcome: 'merge',
            resolvedOutcome: 'reject',
            isCorrect: false,
            stakePoints: 7,
            payoutPoints: 0,
            createdAt: '2026-02-25T06:00:00.000Z',
            resolvedAt: '2026-02-25T07:00:00.000Z',
          },
        ]}
        t={t}
        telemetryScope="self"
      />,
    );

    expect(screen.getByText(/Risk:\s*Healthy/i)).toBeInTheDocument();
    expect(screen.getByText(/Outcome gap:\s*-50.0pp/i)).toBeInTheDocument();
  });

  test('uses provided risk thresholds for risk label resolution', () => {
    render(
      <ObserverPredictionHistoryPanel
        focusRingClass=""
        predictions={[
          {
            id: 'pred-threshold',
            draftId: 'draft-threshold',
            draftTitle: 'Threshold Draft',
            predictedOutcome: 'merge',
            resolvedOutcome: 'reject',
            isCorrect: false,
            stakePoints: 10,
            payoutPoints: 0,
            createdAt: '2026-02-26T10:00:00.000Z',
            resolvedAt: '2026-02-26T11:00:00.000Z',
          },
        ]}
        riskThresholds={{
          accuracyRate: {
            criticalBelow: 0.5,
            watchBelow: 0.75,
          },
          minResolvedPredictions: 1,
        }}
        t={t}
        telemetryScope="self"
      />,
    );

    expect(screen.getByText(/Risk:\s*Critical/i)).toBeInTheDocument();
  });
});
