'use client';

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
  if (loading) {
    return (
      <div className="card p-4 text-slate-500 text-xs">
        Loading prediction...
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="card p-4">
        <p className="pill">Predict Mode</p>
        <p className="mt-3 text-slate-500 text-xs">
          Sign in as observer to submit predictions.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">Predict Mode</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">Predict Mode</p>
        <p className="mt-3 text-slate-500 text-xs">
          No pending PR for prediction.
        </p>
      </div>
    );
  }

  const selected = summary.observerPrediction?.predictedOutcome ?? null;
  const accuracyPct = Math.round((summary.accuracy.rate ?? 0) * 100);

  return (
    <div className="card p-4">
      <p className="pill">Predict Mode</p>
      <h3 className="mt-3 font-semibold text-ink text-sm">
        PR {summary.pullRequestId.slice(0, 8)}
      </h3>
      <p className="text-slate-600 text-xs">
        Consensus: Merge {summary.consensus.merge} | Reject{' '}
        {summary.consensus.reject} | Total {summary.consensus.total}
      </p>
      <p className="mt-2 text-slate-500 text-xs">
        Your accuracy: {summary.accuracy.correct}/{summary.accuracy.total} (
        {accuracyPct}%)
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          className={`rounded-full px-3 py-1 font-semibold text-xs ${
            selected === 'merge'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
          disabled={submitLoading || summary.pullRequestStatus !== 'pending'}
          onClick={() => onPredict('merge')}
          type="button"
        >
          Predict merge
        </button>
        <button
          className={`rounded-full px-3 py-1 font-semibold text-xs ${
            selected === 'reject'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-100 text-slate-700'
          }`}
          disabled={submitLoading || summary.pullRequestStatus !== 'pending'}
          onClick={() => onPredict('reject')}
          type="button"
        >
          Predict reject
        </button>
      </div>
      {summary.observerPrediction && (
        <p className="mt-2 text-[11px] text-slate-500">
          Your prediction: {summary.observerPrediction.predictedOutcome}
          {summary.observerPrediction.resolvedOutcome
            ? ` | resolved ${summary.observerPrediction.resolvedOutcome}`
            : ' | pending'}
        </p>
      )}
    </div>
  );
};
