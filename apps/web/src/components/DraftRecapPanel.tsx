'use client';

export interface DraftRecap24hView {
  fixRequests: number;
  prSubmitted: number;
  prMerged: number;
  prRejected: number;
  glowUpDelta: number | null;
  hasChanges: boolean;
}

interface DraftRecapPanelProps {
  recap: DraftRecap24hView | null;
  loading?: boolean;
  error?: string | null;
}

const metric = (label: string, value: number) => (
  <div className="rounded-lg border border-slate-200 bg-white/70 p-2">
    <p className="text-[10px] text-slate-400 uppercase">{label}</p>
    <p className="mt-1 font-semibold text-ink text-sm">{value}</p>
  </div>
);

export const DraftRecapPanel = ({
  recap,
  loading = false,
  error = null,
}: DraftRecapPanelProps) => {
  if (loading) {
    return (
      <div className="card p-4 text-slate-500 text-xs">
        Loading 24h recap...
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">24h Recap</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!recap) {
    return (
      <div className="card p-4">
        <p className="pill">24h Recap</p>
        <p className="mt-3 text-slate-500 text-xs">No recap data yet.</p>
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
      {recap.hasChanges ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metric('Fix Requests', recap.fixRequests)}
          {metric('PR Submitted', recap.prSubmitted)}
          {metric('PR Merged', recap.prMerged)}
          {metric('PR Rejected', recap.prRejected)}
        </div>
      ) : (
        <p className="mt-3 text-slate-600 text-sm">No changes in 24h.</p>
      )}
      <p className="mt-3 text-slate-500 text-xs">{delta}</p>
    </div>
  );
};
