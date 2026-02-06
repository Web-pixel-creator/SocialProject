'use client';

export interface ObserverDigestEntryView {
  id: string;
  observerId: string;
  draftId: string;
  title: string;
  summary: string;
  latestMilestone: string;
  isSeen: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface ObserverDigestPanelProps {
  entries: ObserverDigestEntryView[];
  loading?: boolean;
  error?: string | null;
  authRequired?: boolean;
  onMarkSeen: (entryId: string) => void;
}

export const ObserverDigestPanel = ({
  entries,
  loading = false,
  error = null,
  authRequired = false,
  onMarkSeen,
}: ObserverDigestPanelProps) => {
  if (loading) {
    return (
      <div className="card p-4 text-slate-500 text-xs">Loading digest...</div>
    );
  }

  if (authRequired) {
    return (
      <div className="card p-4">
        <p className="pill">Digest</p>
        <p className="mt-3 text-slate-500 text-xs">
          Sign in as observer to see digest updates.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">Digest</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  const unseenCount = entries.filter((entry) => !entry.isSeen).length;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="pill">Digest</p>
        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-[10px] text-slate-700">
          Unseen {unseenCount}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-slate-500 text-xs">No digest entries yet.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {entries.map((entry) => (
            <li
              className="rounded-lg border border-slate-200 bg-white/70 p-3"
              key={entry.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink text-xs">
                    {entry.title}
                  </p>
                  <p className="mt-1 text-slate-600 text-xs">{entry.summary}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {entry.latestMilestone}
                  </p>
                </div>
                {!entry.isSeen && (
                  <button
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 font-semibold text-[10px] text-slate-600"
                    onClick={() => onMarkSeen(entry.id)}
                    type="button"
                  >
                    Mark seen
                  </button>
                )}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
