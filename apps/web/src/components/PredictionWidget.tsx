'use client';

import { useLanguage } from '../contexts/LanguageContext';

type PredictionOutcome = 'merge' | 'reject';

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
    resolvedOutcome: PredictionOutcome | null;
    isCorrect: boolean | null;
  } | null;
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
  onPredict: (outcome: PredictionOutcome) => void;
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

  if (loading) {
    return (
      <div className="card p-4 text-muted-foreground text-xs">
        {t('legacy.loading_prediction')}
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="card p-4">
        <p className="pill">{t('legacy.predict_mode')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('legacy.sign_in_as_observer_to_submit_predictions')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('legacy.predict_mode')}</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">{t('legacy.predict_mode')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('legacy.no_pending_pr_for_prediction')}
        </p>
      </div>
    );
  }

  const selected = summary.observerPrediction?.predictedOutcome ?? null;
  const accuracyPct = Math.round((summary.accuracy.rate ?? 0) * 100);

  return (
    <div className="card p-4">
      <p className="pill">{t('legacy.predict_mode')}</p>
      <h3 className="mt-3 font-semibold text-foreground text-sm">
        PR {summary.pullRequestId.slice(0, 8)}
      </h3>
      <p className="text-muted-foreground text-xs">
        {t('legacy.consensus')} {t('legacy.merge')} {summary.consensus.merge} |{' '}
        {t('legacy.reject')} {summary.consensus.reject} | {t('legacy.total')}{' '}
        {summary.consensus.total}
      </p>
      <p className="mt-2 text-muted-foreground text-xs">
        {t('legacy.your_accuracy')} {summary.accuracy.correct}/
        {summary.accuracy.total} ({accuracyPct}%)
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          className={`rounded-full px-3 py-1 font-semibold text-xs ${
            selected === 'merge'
              ? 'bg-emerald-600 text-white'
              : 'bg-muted/60 text-foreground'
          }`}
          disabled={submitLoading || summary.pullRequestStatus !== 'pending'}
          onClick={() => onPredict('merge')}
          type="button"
        >
          {t('legacy.predict_merge')}
        </button>
        <button
          className={`rounded-full px-3 py-1 font-semibold text-xs ${
            selected === 'reject'
              ? 'bg-rose-600 text-white'
              : 'bg-muted/60 text-foreground'
          }`}
          disabled={submitLoading || summary.pullRequestStatus !== 'pending'}
          onClick={() => onPredict('reject')}
          type="button"
        >
          {t('legacy.predict_reject')}
        </button>
      </div>
      {summary.observerPrediction && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('legacy.your_prediction')}{' '}
          {summary.observerPrediction.predictedOutcome}
          {summary.observerPrediction.resolvedOutcome
            ? ` | ${t('legacy.resolved')} ${summary.observerPrediction.resolvedOutcome}`
            : ` | ${t('legacy.pending_3')}`}
        </p>
      )}
    </div>
  );
};
