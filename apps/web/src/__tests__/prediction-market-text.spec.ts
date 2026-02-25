import type { PredictionMarketSnapshot } from '../lib/predictionMarket';
import {
  formatPredictionMarketPoolLine,
  formatPredictionNetPointsLine,
  formatPredictionOddsLine,
  formatPredictionPayoutLine,
  formatPredictionUsageLine,
} from '../lib/predictionMarketText';

const t = (key: string): string => {
  const dictionary: Record<string, string> = {
    'prediction.marketPool': 'Pool',
    'pr.merge': 'Merge',
    'pr.reject': 'Reject',
    'prediction.oddsLabel': 'Odds',
    'prediction.potentialPayoutLabel': 'Payout',
    'prediction.dailyStakeLabel': 'Stake/day',
    'prediction.dailySubmissionsLabel': 'Submissions/day',
    'observerProfile.remaining': 'Remaining',
    'prediction.netPoints': 'Net',
  };
  return dictionary[key] ?? key;
};

const snapshot: PredictionMarketSnapshot = {
  dailyStakeCapPoints: 100,
  dailyStakeRemainingPoints: 80,
  dailyStakeUsedPoints: 20,
  dailySubmissionCap: 10,
  dailySubmissionsRemaining: 8,
  dailySubmissionsUsed: 2,
  hasMarketSummary: true,
  hasObserverMarketProfile: true,
  hasPotentialPayout: true,
  hasUsageCaps: true,
  marketPoolPoints: 60,
  mergeOddsPercent: 55,
  mergeOddsRatio: 0.55,
  mergePayoutMultiplier: 1.82,
  mergeStakePoints: 33,
  observerNetPoints: 14,
  potentialMergePayout: 18,
  potentialRejectPayout: 21,
  rejectOddsPercent: 45,
  rejectOddsRatio: 0.45,
  rejectPayoutMultiplier: 2.22,
  rejectStakePoints: 27,
  totalStakePoints: 60,
  trustTier: 'core',
};

describe('predictionMarketText', () => {
  test('formats pool line', () => {
    expect(formatPredictionMarketPoolLine(t, snapshot)).toBe(
      'Pool 60 FIN | Merge 33 | Reject 27',
    );
  });

  test('formats odds line with multipliers', () => {
    expect(formatPredictionOddsLine(t, snapshot)).toBe(
      'Odds Merge 55% (x1.82) | Reject 45% (x2.22)',
    );
  });

  test('formats payout line', () => {
    expect(formatPredictionPayoutLine(t, snapshot)).toBe(
      'Payout Merge 18 FIN | Reject 21 FIN',
    );
  });

  test('formats usage line with remaining values', () => {
    expect(
      formatPredictionUsageLine(t, snapshot, {
        includeRemaining: true,
        unknownCapLabel: '-',
      }),
    ).toBe(
      'Stake/day 20/100 (Remaining 80) | Submissions/day 2/10 (Remaining 8)',
    );
  });

  test('formats usage line with unknown caps fallback', () => {
    const unknownCapsSnapshot: PredictionMarketSnapshot = {
      ...snapshot,
      dailyStakeCapPoints: null,
      dailyStakeRemainingPoints: null,
      dailySubmissionCap: null,
      dailySubmissionsRemaining: null,
    };
    expect(
      formatPredictionUsageLine(t, unknownCapsSnapshot, {
        includeRemaining: false,
        unknownCapLabel: '?',
      }),
    ).toBe('Stake/day 20/? | Submissions/day 2/?');
  });

  test('formats net points line', () => {
    expect(formatPredictionNetPointsLine(t, snapshot.observerNetPoints)).toBe(
      'Net 14 FIN',
    );
  });
});
