'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { buildPredictionMarketSnapshot } from '../lib/predictionMarket';
import {
  formatPredictionMarketPoolLine,
  formatPredictionNetPointsLine,
  formatPredictionOddsLine,
  formatPredictionPayoutLine,
  formatPredictionUsageLine,
} from '../lib/predictionMarketText';
import {
  derivePredictionUsageLimitState,
  normalizePredictionStakeBounds,
  resolvePredictionStakeInput,
} from '../lib/predictionStake';
import {
  formatPredictionTrustTier,
  type PredictionTrustTier,
} from '../lib/predictionTier';

type PredictionOutcome = 'merge' | 'reject';
const DEFAULT_STAKE_POINTS = 10;

export interface PullRequestPredictionSummaryView {
  pullRequestId: string;
  pullRequestStatus: 'pending' | 'merged' | 'rejected' | 'changes_requested';
  consensus: {
    merge: number;
    reject: number;
    total: number;
  };
  observerPrediction: {
    predictedOutcome: PredictionOutcome;
    stakePoints?: number;
    payoutPoints?: number;
    resolvedOutcome: PredictionOutcome | null;
    isCorrect: boolean | null;
  } | null;
  market?: {
    minStakePoints?: number;
    maxStakePoints?: number;
    mergeStakePoints?: number;
    rejectStakePoints?: number;
    totalStakePoints?: number;
    mergeOdds?: number;
    rejectOdds?: number;
    mergePayoutMultiplier?: number;
    rejectPayoutMultiplier?: number;
    observerNetPoints?: number;
    trustTier?: PredictionTrustTier;
    dailyStakeCapPoints?: number;
    dailyStakeUsedPoints?: number;
    dailySubmissionCap?: number;
    dailySubmissionsUsed?: number;
  };
  accuracy: {
    correct: number;
    total: number;
    rate: number;
  };
}

interface PredictionWidgetProps {
  summary: PullRequestPredictionSummaryView | null;
  loading?: boolean;
  error?: string | null;
  authRequired?: boolean;
  onPredict: (outcome: PredictionOutcome, stakePoints: number) => void;
  submitLoading?: boolean;
}

export const PredictionWidget = ({
  summary,
  loading = false,
  error = null,
  authRequired = false,
  onPredict,
  submitLoading = false,
}: PredictionWidgetProps) => {
  const { t } = useLanguage();
  const [stakeInput, setStakeInput] = useState<string>(
    String(DEFAULT_STAKE_POINTS),
  );

  const { minStakePoints: minStake, maxStakePoints: maxStake } =
    normalizePredictionStakeBounds({
      minStakePoints: summary?.market?.minStakePoints,
      maxStakePoints: summary?.market?.maxStakePoints,
    });
  const { adjusted: stakeWasAdjusted, stakePoints: normalizedStake } = useMemo(
    () =>
      resolvePredictionStakeInput({
        rawValue: stakeInput,
        bounds: { minStakePoints: minStake, maxStakePoints: maxStake },
        fallbackStakePoints: DEFAULT_STAKE_POINTS,
      }),
    [maxStake, minStake, stakeInput],
  );
  const stakeAdjustmentHint = stakeWasAdjusted
    ? `${t('prediction.stakeAutoAdjusted')} ${minStake}-${maxStake} FIN.`
    : null;

  useEffect(() => {
    const pullRequestId = summary?.pullRequestId;
    const baseStake = summary?.observerPrediction?.stakePoints;
    if (!pullRequestId) {
      setStakeInput(String(DEFAULT_STAKE_POINTS));
      return;
    }
    setStakeInput(String(baseStake ?? DEFAULT_STAKE_POINTS));
  }, [summary?.observerPrediction?.stakePoints, summary?.pullRequestId]);

  if (loading) {
    return (
      <div className="card p-4 text-muted-foreground text-xs">
        {t('prediction.loading')}
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="card p-4">
        <p className="pill">{t('sidebar.predictMode')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('prediction.signInRequired')}
        </p>
        <div className="mt-3">
          <Link
            className="inline-flex min-h-8 items-center rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 font-semibold text-[11px] text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/login"
          >
            {t('header.signIn')}
          </Link>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">{t('sidebar.predictMode')}</p>
        <p
          className={`mt-3 text-xs ${
            error ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {error ?? t('prediction.noPendingPr')}
        </p>
      </div>
    );
  }

  const selected = summary.observerPrediction?.predictedOutcome ?? null;
  const accuracyPct = Math.round((summary.accuracy.rate ?? 0) * 100);
  const marketSnapshot = buildPredictionMarketSnapshot({
    dailyStakeCapPoints: summary.market?.dailyStakeCapPoints,
    dailyStakeUsedPoints: summary.market?.dailyStakeUsedPoints,
    dailySubmissionCap: summary.market?.dailySubmissionCap,
    dailySubmissionsUsed: summary.market?.dailySubmissionsUsed,
    mergeOdds: summary.market?.mergeOdds,
    mergePayoutMultiplier: summary.market?.mergePayoutMultiplier,
    mergeStakePoints: summary.market?.mergeStakePoints,
    observerNetPoints: summary.market?.observerNetPoints,
    rejectOdds: summary.market?.rejectOdds,
    rejectPayoutMultiplier: summary.market?.rejectPayoutMultiplier,
    rejectStakePoints: summary.market?.rejectStakePoints,
    stakePointsForPotential: normalizedStake,
    totalStakePoints: summary.market?.totalStakePoints,
    trustTier: summary.market?.trustTier,
  });
  const trustTier = marketSnapshot.trustTier ?? 'entry';
  const trustTierLabel = formatPredictionTrustTier(trustTier, t);
  const hasExistingPrediction = Boolean(
    summary.observerPrediction?.predictedOutcome,
  );
  const { dailyStakeCapReached, dailySubmissionCapReached } =
    derivePredictionUsageLimitState({
      hasExistingPrediction,
      stakePoints: normalizedStake,
      dailyStakeCapPoints: marketSnapshot.dailyStakeCapPoints,
      dailyStakeUsedPoints: marketSnapshot.dailyStakeUsedPoints,
      dailySubmissionCap: marketSnapshot.dailySubmissionCap,
      dailySubmissionsUsed: marketSnapshot.dailySubmissionsUsed,
    });
  const limitsReached = dailyStakeCapReached || dailySubmissionCapReached;
  const predictionDisabled =
    submitLoading || summary.pullRequestStatus !== 'pending' || limitsReached;
  let limitReason: string | null = null;
  if (dailyStakeCapReached) {
    limitReason = t('prediction.limitStakeCapReached');
  } else if (dailySubmissionCapReached) {
    limitReason = t('prediction.limitSubmissionCapReached');
  }

  return (
    <div className="card p-4">
      <p className="pill">{t('sidebar.predictMode')}</p>
      <h3 className="mt-3 font-semibold text-foreground text-sm">
        PR {summary.pullRequestId.slice(0, 8)}
      </h3>
      <p className="text-muted-foreground text-xs">
        {t('pr.consensus')} {t('pr.merge')} {summary.consensus.merge} |{' '}
        {t('pr.reject')} {summary.consensus.reject} | {t('pr.total')}{' '}
        {summary.consensus.total}
      </p>
      {error ? <p className="mt-2 text-destructive text-xs">{error}</p> : null}
      <p className="mt-2 text-muted-foreground text-xs">
        {formatPredictionMarketPoolLine(t, marketSnapshot)}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {formatPredictionOddsLine(t, marketSnapshot)}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {formatPredictionPayoutLine(t, marketSnapshot)}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {t('prediction.tierLabel')} {trustTierLabel} |{' '}
        {formatPredictionUsageLine(t, marketSnapshot, {
          includeRemaining: false,
          unknownCapLabel: '-',
        })}
      </p>
      <p className="mt-2 text-muted-foreground text-xs">
        {t('prediction.yourAccuracy')} {summary.accuracy.correct}/
        {summary.accuracy.total} ({accuracyPct}%)
      </p>
      <div className="mt-3 grid gap-2">
        <label className="text-[11px] text-muted-foreground" htmlFor="stake">
          {t('prediction.stakeLabel')}
        </label>
        <input
          className="rounded-full border border-border/35 bg-background/70 px-3 py-1.5 text-foreground text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={predictionDisabled}
          id="stake"
          inputMode="numeric"
          max={maxStake}
          min={minStake}
          onChange={(event) => setStakeInput(event.target.value)}
          type="number"
          value={stakeInput}
        />
        {stakeAdjustmentHint ? (
          <p className="text-[11px] text-muted-foreground">
            {stakeAdjustmentHint}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          className={`rounded-full px-3 py-1 font-semibold text-xs ${
            selected === 'merge'
              ? 'border border-chart-2/55 bg-chart-2/14 text-chart-2'
              : 'bg-muted/60 text-foreground'
          }`}
          disabled={predictionDisabled}
          onClick={() => onPredict('merge', normalizedStake)}
          type="button"
        >
          {t('prediction.predictMerge')}
        </button>
        <button
          className={`rounded-full px-3 py-1 font-semibold text-xs ${
            selected === 'reject'
              ? 'border border-destructive/55 bg-destructive/12 text-destructive'
              : 'bg-muted/60 text-foreground'
          }`}
          disabled={predictionDisabled}
          onClick={() => onPredict('reject', normalizedStake)}
          type="button"
        >
          {t('prediction.predictReject')}
        </button>
      </div>
      {limitReason ? (
        <p className="mt-2 text-[11px] text-destructive">{limitReason}</p>
      ) : null}
      {summary.observerPrediction && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('prediction.yourPrediction')}{' '}
          {summary.observerPrediction.predictedOutcome}
          {` | ${t('prediction.stakeLabel')} ${
            summary.observerPrediction.stakePoints ?? DEFAULT_STAKE_POINTS
          }`}
          {summary.observerPrediction.resolvedOutcome
            ? ` | ${t('pr.resolved')} ${summary.observerPrediction.resolvedOutcome}`
            : ` | ${t('battle.pending')}`}
          {summary.observerPrediction.resolvedOutcome
            ? ` | ${t('prediction.payoutLabel')} ${summary.observerPrediction.payoutPoints ?? 0}`
            : ''}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {formatPredictionNetPointsLine(t, marketSnapshot.observerNetPoints)}
      </p>
    </div>
  );
};
