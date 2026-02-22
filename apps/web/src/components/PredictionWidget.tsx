'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
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

  const minStake = summary?.market?.minStakePoints ?? 5;
  const maxStake = summary?.market?.maxStakePoints ?? 500;
  const normalizedStake = useMemo(() => {
    const parsed = Number.parseInt(stakeInput, 10);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_STAKE_POINTS;
    }
    return Math.max(minStake, Math.min(maxStake, parsed));
  }, [maxStake, minStake, stakeInput]);

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
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('sidebar.predictMode')}</p>
        <p className="mt-3 text-destructive text-xs">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">{t('sidebar.predictMode')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('prediction.noPendingPr')}
        </p>
      </div>
    );
  }

  const selected = summary.observerPrediction?.predictedOutcome ?? null;
  const accuracyPct = Math.round((summary.accuracy.rate ?? 0) * 100);
  const mergeStakePoints = summary.market?.mergeStakePoints ?? 0;
  const rejectStakePoints = summary.market?.rejectStakePoints ?? 0;
  const totalStakePoints =
    summary.market?.totalStakePoints ?? mergeStakePoints + rejectStakePoints;
  const mergeOdds =
    summary.market?.mergeOdds ??
    (totalStakePoints > 0 ? mergeStakePoints / totalStakePoints : 0);
  const rejectOdds =
    summary.market?.rejectOdds ??
    (totalStakePoints > 0 ? rejectStakePoints / totalStakePoints : 0);
  const mergePayoutMultiplier =
    summary.market?.mergePayoutMultiplier ??
    (mergeStakePoints > 0 ? totalStakePoints / mergeStakePoints : 0);
  const rejectPayoutMultiplier =
    summary.market?.rejectPayoutMultiplier ??
    (rejectStakePoints > 0 ? totalStakePoints / rejectStakePoints : 0);
  const potentialMergePayout = Math.round(
    normalizedStake * mergePayoutMultiplier,
  );
  const potentialRejectPayout = Math.round(
    normalizedStake * rejectPayoutMultiplier,
  );
  const trustTier = summary.market?.trustTier ?? 'entry';
  const trustTierLabel = formatPredictionTrustTier(trustTier, t);
  const dailyStakeUsed = summary.market?.dailyStakeUsedPoints ?? 0;
  const dailyStakeCap = summary.market?.dailyStakeCapPoints ?? 0;
  const dailySubmissionsUsed = summary.market?.dailySubmissionsUsed ?? 0;
  const dailySubmissionCap = summary.market?.dailySubmissionCap ?? 0;
  const hasExistingPrediction = Boolean(
    summary.observerPrediction?.predictedOutcome,
  );
  const dailyStakeCapReached =
    !hasExistingPrediction &&
    dailyStakeCap > 0 &&
    dailyStakeUsed + normalizedStake > dailyStakeCap;
  const dailySubmissionCapReached =
    !hasExistingPrediction &&
    dailySubmissionCap > 0 &&
    dailySubmissionsUsed >= dailySubmissionCap;
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
      <p className="mt-2 text-muted-foreground text-xs">
        {t('prediction.marketPool')} {totalStakePoints} FIN | {t('pr.merge')}{' '}
        {mergeStakePoints} | {t('pr.reject')} {rejectStakePoints}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {t('prediction.oddsLabel')} {t('pr.merge')}{' '}
        {Math.round(mergeOdds * 100)}% (x{mergePayoutMultiplier.toFixed(2)}) |{' '}
        {t('pr.reject')} {Math.round(rejectOdds * 100)}% (x
        {rejectPayoutMultiplier.toFixed(2)})
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {t('prediction.potentialPayoutLabel')} {t('pr.merge')}{' '}
        {potentialMergePayout} FIN | {t('pr.reject')} {potentialRejectPayout}{' '}
        FIN
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        {t('prediction.tierLabel')} {trustTierLabel} |{' '}
        {t('prediction.dailyStakeLabel')} {dailyStakeUsed}/{dailyStakeCap} |{' '}
        {t('prediction.dailySubmissionsLabel')} {dailySubmissionsUsed}/
        {dailySubmissionCap}
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
        {t('prediction.netPoints')} {summary.market?.observerNetPoints ?? 0} FIN
      </p>
    </div>
  );
};
