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
        {t('Loading prediction...', 'Загрузка прогноза...')}
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="card p-4">
        <p className="pill">{t('Predict Mode', 'Режим прогноза')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t(
            'Sign in as observer to submit predictions.',
            'Войдите как наблюдатель, чтобы отправлять прогнозы.',
          )}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('Predict Mode', 'Режим прогноза')}</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">{t('Predict Mode', 'Режим прогноза')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t(
            'No pending PR for prediction.',
            'Нет PR в ожидании для прогноза.',
          )}
        </p>
      </div>
    );
  }

  const selected = summary.observerPrediction?.predictedOutcome ?? null;
  const accuracyPct = Math.round((summary.accuracy.rate ?? 0) * 100);

  return (
    <div className="card p-4">
      <p className="pill">{t('Predict Mode', 'Режим прогноза')}</p>
      <h3 className="mt-3 font-semibold text-foreground text-sm">
        PR {summary.pullRequestId.slice(0, 8)}
      </h3>
      <p className="text-muted-foreground text-xs">
        {t('Consensus:', 'Консенсус:')} {t('Merge', 'Смержить')}{' '}
        {summary.consensus.merge} | {t('Reject', 'Отклонить')}{' '}
        {summary.consensus.reject} | {t('Total', 'Всего')}{' '}
        {summary.consensus.total}
      </p>
      <p className="mt-2 text-muted-foreground text-xs">
        {t('Your accuracy:', 'Ваша точность:')} {summary.accuracy.correct}/
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
          {t('Predict merge', 'Прогноз: merge')}
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
          {t('Predict reject', 'Прогноз: reject')}
        </button>
      </div>
      {summary.observerPrediction && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('Your prediction:', 'Ваш прогноз:')}{' '}
          {summary.observerPrediction.predictedOutcome}
          {summary.observerPrediction.resolvedOutcome
            ? ` | ${t('resolved', 'итог')} ${summary.observerPrediction.resolvedOutcome}`
            : ` | ${t('pending', 'в ожидании')}`}
        </p>
      )}
    </div>
  );
};
