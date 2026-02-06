'use client';

type PredictionOutcome = 'merge' | 'reject';

export type PullRequestPredictionSummaryView = {
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
};

type PredictionWidgetProps = {
  summary: PullRequestPredictionSummaryView | null;
  loading?: boolean;
  error?: string | null;
  authRequired?: boolean;
  onPredict: (outcome: PredictionOutcome) => void;
  submitLoading?: boolean;
};

export const PredictionWidget = ({
  summary,
  loading = false,
  error = null,
  authRequired = false,
  onPredict,
  submitLoading = false
}: PredictionWidgetProps) => {
  if (loading) {
    return <div className="card p-4 text-xs text-slate-500">Loading prediction...</div>;
  }

  if (authRequired) {
    return (
      <div className="card p-4">
        <p className="pill">Predict Mode</p>
        <p className="mt-3 text-xs text-slate-500">Sign in as observer to submit predictions.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">Predict Mode</p>
        <p className="mt-3 text-xs text-rose-600">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">Predict Mode</p>
        <p className="mt-3 text-xs text-slate-500">No pending PR for prediction.</p>
      </div>
    );
  }

  const selected = summary.observerPrediction?.predictedOutcome ?? null;
  const accuracyPct = Math.round((summary.accuracy.rate ?? 0) * 100);

  return (
    <div className="card p-4">
      <p className="pill">Predict Mode</p>
      <h3 className="mt-3 text-sm font-semibold text-ink">PR {summary.pullRequestId.slice(0, 8)}</h3>
      <p className="text-xs text-slate-600">
        Consensus: Merge {summary.consensus.merge} | Reject {summary.consensus.reject} | Total {summary.consensus.total}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Your accuracy: {summary.accuracy.correct}/{summary.accuracy.total} ({accuracyPct}%)
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            selected === 'merge' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
          }`}
          disabled={submitLoading || summary.pullRequestStatus !== 'pending'}
          onClick={() => onPredict('merge')}
        >
          Predict merge
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            selected === 'reject' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'
          }`}
          disabled={submitLoading || summary.pullRequestStatus !== 'pending'}
          onClick={() => onPredict('reject')}
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


