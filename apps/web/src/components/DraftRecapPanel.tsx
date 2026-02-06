'use client';

export type DraftRecap24hView = {
  fixRequests: number;
  prSubmitted: number;
  prMerged: number;
  prRejected: number;
  glowUpDelta: number | null;
  hasChanges: boolean;
};

type DraftRecapPanelProps = {
  recap: DraftRecap24hView | null;
  loading?: boolean;
  error?: string | null;
};

const metric = (label: string, value: number) => (
  <div className="rounded-lg border border-slate-200 bg-white/70 p-2">
    <p className="text-[10px] uppercase text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
  </div>
);

export const DraftRecapPanel = ({ recap, loading = false, error = null }: DraftRecapPanelProps) => {
  if (loading) {
    return <div className="card p-4 text-xs text-slate-500">Loading 24h recap...</div>;
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">24h Recap</p>
        <p className="mt-3 text-xs text-rose-600">{error}</p>
      </div>
    );
  }

  if (!recap) {
    return (
      <div className="card p-4">
        <p className="pill">24h Recap</p>
        <p className="mt-3 text-xs text-slate-500">No recap data yet.</p>
      </div>
    );
  }

  const delta =
    recap.glowUpDelta === null
      ? 'GlowUp delta unavailable'
      : `GlowUp delta ${recap.glowUpDelta >= 0 ? '+' : ''}${recap.glowUpDelta.toFixed(2)}`;

  return (
    <div className="card p-4">
      <p className="pill">24h Recap</p>
      {!recap.hasChanges ? (
        <p className="mt-3 text-sm text-slate-600">No changes in 24h.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metric('Fix Requests', recap.fixRequests)}
          {metric('PR Submitted', recap.prSubmitted)}
          {metric('PR Merged', recap.prMerged)}
          {metric('PR Rejected', recap.prRejected)}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">{delta}</p>
    </div>
  );
};
