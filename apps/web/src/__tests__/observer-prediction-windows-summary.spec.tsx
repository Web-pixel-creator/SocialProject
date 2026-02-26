/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ObserverPredictionWindowsSummary } from '../components/ObserverPredictionWindowsSummary';

const translations: Record<string, string> = {
  'observerProfile.recentWindowAccuracy': 'Recent resolved accuracy',
  'observerProfile.predictionNet': 'Net',
  'observerProfile.predictionWindowRisk7d': '7d risk',
  'observerProfile.predictionWindowRisk30d': '30d risk',
  'observerProfile.predictionWindowRiskMinSample': 'min sample',
  'observerProfile.predictionWindowRiskThresholds': 'thresholds',
  'observerProfile.health.healthy': 'Healthy',
  'observerProfile.health.watch': 'Watch',
  'observerProfile.health.critical': 'Critical',
  'observerProfile.health.unknown': 'n/a',
};

const t = (key: string): string => translations[key] ?? key;

describe('ObserverPredictionWindowsSummary', () => {
  test('renders window accuracy, net and API-first risk labels', () => {
    render(
      <ObserverPredictionWindowsSummary
        recentWindow={{
          size: 10,
          resolved: 5,
          correct: 4,
          rate: 0.8,
        }}
        t={t}
        thresholds={{
          accuracyRate: {
            criticalBelow: 0.47,
            watchBelow: 0.62,
          },
          minResolvedPredictions: 2,
        }}
        timeWindows={{
          d7: {
            days: 7,
            resolved: 3,
            correct: 2,
            rate: 0.67,
            netPoints: 9,
            riskLevel: 'watch',
          },
          d30: {
            days: 30,
            resolved: 8,
            correct: 6,
            rate: 0.75,
            netPoints: 24,
            riskLevel: 'critical',
          },
        }}
      />,
    );

    expect(
      screen.getByText(/Recent resolved accuracy \(10\): 80% \(4\/5\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /7d: 67% \(2\/3\), Net: \+9 \| 30d: 75% \(6\/8\), Net: \+24/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/7d risk/i)).toBeInTheDocument();
    expect(screen.getByText(/^Watch$/i)).toBeInTheDocument();
    expect(screen.getByText(/30d risk/i)).toBeInTheDocument();
    expect(screen.getByText(/^Critical$/i)).toBeInTheDocument();
    expect(screen.getByText(/min sample:\s*2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/thresholds:\s*watch <62%, critical <47%/i),
    ).toBeInTheDocument();
  });

  test('falls back to unknown risk below min sample', () => {
    render(
      <ObserverPredictionWindowsSummary
        recentWindow={null}
        t={t}
        thresholds={{
          accuracyRate: {
            criticalBelow: 0.45,
            watchBelow: 0.6,
          },
          minResolvedPredictions: 3,
        }}
        timeWindows={{
          d7: {
            days: 7,
            resolved: 1,
            correct: 1,
            rate: 1,
            netPoints: 6,
          },
          d30: {
            days: 30,
            resolved: 2,
            correct: 1,
            rate: 0.5,
            netPoints: 4,
          },
        }}
      />,
    );

    expect(screen.getAllByText(/^n\/a$/i)).toHaveLength(2);
    expect(screen.getByText(/min sample:\s*3/i)).toBeInTheDocument();
  });
});
