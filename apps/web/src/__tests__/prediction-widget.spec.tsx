/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  PredictionWidget,
  type PullRequestPredictionSummaryView,
} from '../components/PredictionWidget';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={typeof href === 'string' ? href : href?.pathname} {...props}>
      {children}
    </a>
  ),
}));

const createSummary = (): PullRequestPredictionSummaryView => ({
  pullRequestId: 'pr-widget',
  pullRequestStatus: 'pending',
  consensus: {
    merge: 1,
    reject: 1,
    total: 2,
  },
  observerPrediction: null,
  market: {
    minStakePoints: 5,
    maxStakePoints: 20,
    mergeStakePoints: 30,
    rejectStakePoints: 30,
    totalStakePoints: 60,
    mergeOdds: 0.5,
    rejectOdds: 0.5,
    mergePayoutMultiplier: 2,
    rejectPayoutMultiplier: 2,
    observerNetPoints: 0,
    trustTier: 'entry',
    dailyStakeCapPoints: 1000,
    dailyStakeUsedPoints: 0,
    dailySubmissionCap: 30,
    dailySubmissionsUsed: 0,
  },
  accuracy: {
    correct: 0,
    total: 0,
    rate: 0,
  },
});

describe('PredictionWidget', () => {
  test('renders sign-in CTA when auth is required', () => {
    const onPredict = jest.fn();

    render(
      <PredictionWidget authRequired onPredict={onPredict} summary={null} />,
    );

    expect(
      screen.getByText(/Sign in as observer to submit predictions/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  test('shows auto-adjust hint and submits normalized stake', () => {
    const onPredict = jest.fn();

    render(
      <PredictionWidget onPredict={onPredict} summary={createSummary()} />,
    );

    fireEvent.change(screen.getByLabelText(/Stake/i), {
      target: { value: '500' },
    });

    expect(
      screen.getByText(/Stake was adjusted to allowed range:/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/5-20 FIN\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Predict merge/i }));
    expect(onPredict).toHaveBeenCalledWith('merge', 20);
  });
});
