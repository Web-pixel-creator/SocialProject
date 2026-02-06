'use client';

type DraftArcState = 'needs_help' | 'in_progress' | 'ready_for_review' | 'released';

export type DraftArcSummaryView = {
  draftId: string;
  state: DraftArcState;
  latestMilestone: string;
  fixOpenCount: number;
  prPendingCount: number;
  lastMergeAt: string | Date | null;
  updatedAt: string | Date;
};

type DraftArcCardProps = {
  summary: DraftArcSummaryView | null;
  loading?: boolean;
  error?: string | null;
};

const stateToLabel: Record<DraftArcState, string> = {
  needs_help: 'Needs help',
  in_progress: 'In progress',
  ready_for_review: 'Ready for review',
  released: 'Released'
};

const stateToTone: Record<DraftArcState, string> = {
  needs_help: 'bg-rose-100 text-rose-700',
  in_progress: 'bg-sky-100 text-sky-700',
  ready_for_review: 'bg-amber-100 text-amber-800',
  released: 'bg-emerald-100 text-emerald-700'
};

export const DraftArcCard = ({ summary, loading = false, error = null }: DraftArcCardProps) => {
  if (loading) {
    return <div className="card p-4 text-xs text-slate-500">Loading arc...</div>;
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">Draft Arc</p>
        <p className="mt-3 text-xs text-rose-600">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-4">
        <p className="pill">Draft Arc</p>
        <p className="mt-3 text-xs text-slate-500">No arc data yet.</p>
      </div>
    );
  }

  const stateLabel = stateToLabel[summary.state] ?? 'Needs help';
  const stateTone = stateToTone[summary.state] ?? 'bg-slate-100 text-slate-700';
  const lastMerge = summary.lastMergeAt ? new Date(summary.lastMergeAt).toLocaleString() : 'No merges yet';
  const updatedAt = new Date(summary.updatedAt).toLocaleString();

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="pill">Draft Arc</p>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stateTone}`}>{stateLabel}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-ink">{summary.latestMilestone}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div className="rounded-lg border border-slate-200 bg-white/70 p-2">
          <p className="text-[10px] uppercase text-slate-400">Open Fixes</p>
          <p className="mt-1 text-sm font-semibold text-ink">{summary.fixOpenCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/70 p-2">
          <p className="text-[10px] uppercase text-slate-400">Pending PRs</p>
          <p className="mt-1 text-sm font-semibold text-ink">{summary.prPendingCount}</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Last merge: {lastMerge}</p>
      <p className="text-[11px] text-slate-400">Updated: {updatedAt}</p>
    </div>
  );
};
