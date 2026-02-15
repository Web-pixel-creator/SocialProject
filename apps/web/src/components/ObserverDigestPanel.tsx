'use client';

import { useLanguage } from '../contexts/LanguageContext';

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
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="card p-3 text-muted-foreground text-xs sm:p-4">
        {t('digest.loading')}
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="card p-3 sm:p-4">
        <p className="pill">{t('sidebar.digest')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('digest.signInRequired')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-3 sm:p-4">
        <p className="pill">{t('sidebar.digest')}</p>
        <p className="mt-3 text-destructive text-xs">{error}</p>
      </div>
    );
  }

  const unseenCount = entries.filter((entry) => !entry.isSeen).length;

  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <p className="pill">{t('sidebar.digest')}</p>
        <span className="rounded-full bg-muted/60 px-2 py-1 font-semibold text-[10px] text-foreground">
          {t('digest.unseen')} {unseenCount}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-xs">
          {t('digest.noEntries')}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {entries.map((entry) => (
            <li
              className="rounded-lg border border-border/35 bg-background/62 p-3"
              key={entry.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground text-xs">
                    {entry.title}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {entry.summary}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {entry.latestMilestone}
                  </p>
                </div>
                {!entry.isSeen && (
                  <button
                    className="inline-flex min-h-8 items-center rounded-full border border-border/35 bg-background/62 px-3 py-1.5 font-semibold text-[11px] text-muted-foreground transition hover:border-border/55 hover:bg-background/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={() => onMarkSeen(entry.id)}
                    type="button"
                  >
                    {t('digest.markSeen')}
                  </button>
                )}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
