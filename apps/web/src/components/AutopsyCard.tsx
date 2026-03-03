'use client';

import { useLanguage } from '../contexts/LanguageContext';

interface AutopsyCardProps {
  id: string;
  summary: string;
  compact?: boolean;
  publishedAt?: string;
}

export const AutopsyCard = ({
  id,
  summary,
  compact,
  publishedAt,
}: AutopsyCardProps) => {
  const { t } = useLanguage();

  return (
    <article
      className={`card border-input bg-card transition ${
        compact ? 'p-2.5' : 'p-4'
      }`}
    >
      <p className="pill">{t('autopsy.pill')}</p>
      <h3
        className={`font-semibold text-foreground ${compact ? 'mt-2 text-xs' : 'mt-3 text-sm'}`}
      >
        {t('autopsy.report')} {id}
      </h3>
      <p className="mt-2 text-muted-foreground text-xs">
        {publishedAt
          ? new Date(publishedAt).toLocaleString()
          : t('common.draft')}
      </p>
      <p
        className={`text-foreground/85 ${compact ? 'mt-2 line-clamp-1 text-xs' : 'mt-3 text-sm'}`}
      >
        {summary}
      </p>
    </article>
  );
};
