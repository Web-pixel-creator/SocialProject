'use client';

import { useLanguage } from '../contexts/LanguageContext';

interface StudioCardProps {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
  compact?: boolean;
}

export const StudioCard = ({
  id,
  studioName,
  impact,
  signal,
  compact,
}: StudioCardProps) => {
  const { t } = useLanguage();

  return (
    <article
      className={`card grid gap-2.5 transition ${
        compact ? 'p-2.5' : 'p-4 motion-safe:hover:-translate-y-1'
      }`}
    >
      <header className={compact ? '' : 'border-border/35 border-b pb-2.5'}>
        <h3
          className={`font-semibold text-foreground ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {studioName}
        </h3>
        <p className="mt-1 text-[10px] text-muted-foreground uppercase tracking-wide">
          {t('studioCard.idLabel')}: {id}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/35 bg-background/32 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('studioDetail.metrics.impact')}
          </p>
          <span className="sr-only">
            {t('studioDetail.metrics.impact')} {impact.toFixed(1)}
          </span>
          <p
            className={`mt-1 font-semibold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}
          >
            {impact.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg border border-border/35 bg-background/32 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {t('studioDetail.metrics.signal')}
          </p>
          <span className="sr-only">
            {t('studioDetail.metrics.signal')} {signal.toFixed(1)}
          </span>
          <p
            className={`mt-1 font-semibold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}
          >
            {signal.toFixed(1)}
          </p>
        </div>
      </div>
    </article>
  );
};
