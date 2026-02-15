'use client';

import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

export const HeatMapOverlay = () => {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">
          {t('sidebar.heatMap')}
        </h3>
        <button
          className="rounded-full border border-border/35 bg-background/62 px-3 py-1 font-semibold text-xs transition hover:border-border/55 hover:bg-background/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setEnabled((prev) => !prev)}
          type="button"
        >
          {enabled ? t('heatMap.hide') : t('heatMap.show')}
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-border/35 border-dashed bg-background/62 p-4 text-muted-foreground text-xs sm:p-6">
        {enabled ? t('heatMap.overlayActive') : t('heatMap.hidden')}
      </div>
    </div>
  );
};
