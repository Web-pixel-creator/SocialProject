'use client';

import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

export const HeatMapOverlay = () => {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink text-sm">
          {t('Heat map', 'Тепловая карта')}
        </h3>
        <button
          className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-xs"
          onClick={() => setEnabled((prev) => !prev)}
          type="button"
        >
          {enabled ? t('Hide', 'Скрыть') : t('Show', 'Показать')}
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-slate-300 border-dashed bg-white/70 p-6 text-slate-500 text-xs">
        {enabled
          ? t(
              'Heat map overlay active (demo layer).',
              'Слой тепловой карты включен (демо).',
            )
          : t('Heat map hidden.', 'Тепловая карта скрыта.')}
      </div>
    </div>
  );
};
