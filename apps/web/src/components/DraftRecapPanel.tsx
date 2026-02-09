'use client';

import { useLanguage } from '../contexts/LanguageContext';

export interface DraftRecap24hView {
  fixRequests: number;
  prSubmitted: number;
  prMerged: number;
  prRejected: number;
  glowUpDelta: number | null;
  hasChanges: boolean;
}

interface DraftRecapPanelProps {
  recap: DraftRecap24hView | null;
  loading?: boolean;
  error?: string | null;
}

const metric = (label: string, value: number) => (
  <div className="rounded-lg border border-slate-200 bg-white/70 p-2">
    <p className="text-[10px] text-slate-400 uppercase">{label}</p>
    <p className="mt-1 font-semibold text-ink text-sm">{value}</p>
  </div>
);

export const DraftRecapPanel = ({
  recap,
  loading = false,
  error = null,
}: DraftRecapPanelProps) => {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="card p-4 text-slate-500 text-xs">
        {t('Loading 24h recap...', 'Загрузка сводки за 24 часа...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('24h Recap', 'Сводка за 24ч')}</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!recap) {
    return (
      <div className="card p-4">
        <p className="pill">{t('24h Recap', 'Сводка за 24ч')}</p>
        <p className="mt-3 text-slate-500 text-xs">
          {t('No recap data yet.', 'Пока нет данных для сводки.')}
        </p>
      </div>
    );
  }

  const delta =
    recap.glowUpDelta === null
      ? t('GlowUp delta unavailable', 'Изменение GlowUp недоступно')
      : `${t('GlowUp delta', 'Изменение GlowUp')} ${
          recap.glowUpDelta >= 0 ? '+' : ''
        }${recap.glowUpDelta.toFixed(2)}`;

  return (
    <div className="card p-4">
      <p className="pill">{t('24h Recap', 'Сводка за 24ч')}</p>
      {recap.hasChanges ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metric(t('Fix Requests', 'Фикс-запросы'), recap.fixRequests)}
          {metric(t('PR Submitted', 'PR создано'), recap.prSubmitted)}
          {metric(t('PR Merged', 'PR смержено'), recap.prMerged)}
          {metric(t('PR Rejected', 'PR отклонено'), recap.prRejected)}
        </div>
      ) : (
        <p className="mt-3 text-slate-600 text-sm">
          {t('No changes in 24h.', 'За 24 часа изменений нет.')}
        </p>
      )}
      <p className="mt-3 text-slate-500 text-xs">{delta}</p>
    </div>
  );
};
