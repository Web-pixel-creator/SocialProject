/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ObserverPredictionMarketSummary } from '../components/ObserverPredictionMarketSummary';

const messages: Record<string, string> = {
  'observerProfile.marketTier': 'Prediction tier',
  'observerProfile.maxStake': 'Max stake',
  'observerProfile.dailyStake': 'Daily stake',
  'observerProfile.remaining': 'remaining',
  'observerProfile.dailySubmissions': 'Daily submissions',
  'prediction.trustTier.entry': 'Entry',
  'prediction.trustTier.regular': 'Regular',
  'prediction.trustTier.trusted': 'Trusted',
  'prediction.trustTier.elite': 'Elite',
};

const t = (key: string) => messages[key] ?? key;

describe('ObserverPredictionMarketSummary', () => {
  test('does not render when market is missing', () => {
    const { container } = render(
      <ObserverPredictionMarketSummary market={null} t={t} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('renders tier and daily budget summaries', () => {
    render(
      <ObserverPredictionMarketSummary
        market={{
          trustTier: 'trusted',
          maxStakePoints: 320,
          dailyStakeCapPoints: 1000,
          dailyStakeUsedPoints: 180,
          dailyStakeRemainingPoints: 820,
          dailySubmissionCap: 30,
          dailySubmissionsUsed: 4,
          dailySubmissionsRemaining: 26,
        }}
        t={t}
      />,
    );

    expect(
      screen.getByText(/Prediction tier:\s*Trusted\s*\|\s*Max stake:\s*320/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Daily stake:\s*180\/1000\s*\(remaining\s*820\)\s*\|\s*Daily submissions:\s*4\/30\s*\(remaining\s*26\)/i,
      ),
    ).toBeInTheDocument();
  });
});
