import { formatPredictionOutcomeLabel } from '../lib/predictionOutcome';

describe('formatPredictionOutcomeLabel', () => {
  const t = (key: string) => {
    if (key === 'observerProfile.predictionOutcomeMerge') {
      return 'Merge';
    }
    if (key === 'observerProfile.predictionOutcomeReject') {
      return 'Reject';
    }
    return key;
  };

  test('maps merge outcome', () => {
    expect(formatPredictionOutcomeLabel('merge', t)).toBe('Merge');
  });

  test('maps reject outcome', () => {
    expect(formatPredictionOutcomeLabel('reject', t)).toBe('Reject');
  });
});
