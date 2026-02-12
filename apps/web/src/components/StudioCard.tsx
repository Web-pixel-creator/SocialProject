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
      className={`card transition ${
        compact ? 'p-2.5' : 'p-4 motion-safe:hover:-translate-y-1'
      }`}
    >
      <h3
        className={`font-semibold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}
      >
        {studioName}
      </h3>
      <p
        className={`text-muted-foreground ${compact ? 'mt-1 text-[11px]' : 'mt-2 text-xs'}`}
      >
        {t('studioCard.idLabel')}: {id}
      </p>
      <div
        className={`flex items-center justify-between font-semibold text-foreground ${
          compact ? 'mt-2 text-xs' : 'mt-4 text-sm'
        }`}
      >
        <span>
          {t('studioDetail.metrics.impact')} {impact.toFixed(1)}
        </span>
        <span>
          {t('studioDetail.metrics.signal')} {signal.toFixed(1)}
        </span>
      </div>
    </article>
  );
};
