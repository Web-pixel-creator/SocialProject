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
    <div className="card p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          {t('footer.liveUpdates')}
        </h3>
        <span className="tag-live rounded-full border px-2 py-1 font-semibold text-xs">
          {t('common.live')}
        </span>
      </div>
      {needsResync && (
        <button
          className="mt-3 inline-flex min-h-8 items-center rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-muted-foreground text-xs transition hover:bg-background/74 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={requestResync}
          type="button"
        >
          {t('rail.resyncRequired')}
        </button>
      )}
      <ul className="mt-4 grid gap-2 text-muted-foreground text-xs">
        {events.length === 0 && <li>{t('live.noEvents')}</li>}
        {events.map((event) => (
          <li
            className="rounded-lg border border-border/25 bg-background/60 p-2"
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
