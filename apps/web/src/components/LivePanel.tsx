'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { useRealtimeRoom } from '../hooks/useRealtimeRoom';

interface LivePanelProps {
  scope: string;
}

export const LivePanel = ({ scope }: LivePanelProps) => {
  const { t } = useLanguage();
  const { events, needsResync, requestResync } = useRealtimeRoom(scope);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          {t('legacy.live_updates')}
        </h3>
        <span className="rounded-full bg-emerald-500/15 px-2 py-1 font-semibold text-emerald-500 text-xs">
          {t('legacy.live')}
        </span>
      </div>
      {needsResync && (
        <button
          className="mt-3 rounded-full border border-border px-3 py-1 font-semibold text-muted-foreground text-xs"
          onClick={requestResync}
          type="button"
        >
          {t('legacy.resync_required')}
        </button>
      )}
      <ul className="mt-4 grid gap-2 text-muted-foreground text-xs">
        {events.length === 0 && <li>{t('legacy.no_live_events_yet')}</li>}
        {events.map((event) => (
          <li
            className="rounded-lg border border-border bg-background/70 p-2"
            key={event.id}
          >
            <p className="font-semibold text-muted-foreground">{event.type}</p>
            <p>#{event.sequence}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};
