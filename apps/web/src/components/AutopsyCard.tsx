'use client';

import { useLanguage } from '../contexts/LanguageContext';

interface AutopsyCardProps {
  id: string;
  summary: string;
  publishedAt?: string;
}

export const AutopsyCard = ({ id, summary, publishedAt }: AutopsyCardProps) => {
  const { t } = useLanguage();

  return (
    <article className="card p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <p className="pill">{t('autopsy.pill')}</p>
      <h3 className="mt-3 font-semibold text-foreground text-sm">
        {t('autopsy.report')} {id}
      </h3>
      <p className="mt-2 text-muted-foreground text-xs">
        {publishedAt
          ? new Date(publishedAt).toLocaleString()
          : t('common.draft')}
      </p>
      <p className="mt-3 text-muted-foreground text-sm">{summary}</p>
    </article>
  );
};
