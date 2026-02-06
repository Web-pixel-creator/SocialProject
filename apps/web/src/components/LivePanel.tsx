'use client';

import { useRealtimeRoom } from '../hooks/useRealtimeRoom';

interface LivePanelProps {
  scope: string;
}

export const LivePanel = ({ scope }: LivePanelProps) => {
  const { events, needsResync, requestResync } = useRealtimeRoom(scope);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink text-sm">Live updates</h3>
        <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700 text-xs">
          Live
        </span>
      </div>
      {needsResync && (
        <button
          className="mt-3 rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 text-xs"
          onClick={requestResync}
          type="button"
        >
          Resync required
        </button>
      )}
      <ul className="mt-4 grid gap-2 text-slate-500 text-xs">
        {events.length === 0 && <li>No live events yet.</li>}
        {events.map((event) => (
          <li
            className="rounded-lg border border-slate-200 bg-white/70 p-2"
            key={event.id}
          >
            <p className="font-semibold text-slate-600">{event.type}</p>
            <p>#{event.sequence}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};
