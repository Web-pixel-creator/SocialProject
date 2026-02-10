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
          {t('legacy.heat_map')}
        </h3>
        <button
          className="rounded-full border border-border px-3 py-1 font-semibold text-xs"
          onClick={() => setEnabled((prev) => !prev)}
          type="button"
        >
          {enabled ? t('legacy.hide') : t('legacy.show')}
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-border/70 border-dashed bg-background/70 p-6 text-muted-foreground text-xs">
        {enabled
          ? t('legacy.heat_map_overlay_active_demo_layer')
          : t('legacy.heat_map_hidden')}
      </div>
    </div>
  );
};
