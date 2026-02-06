'use client';

import { useState } from 'react';

export const HeatMapOverlay = () => {
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Heat map</h3>
        <button
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold"
          onClick={() => setEnabled((prev) => !prev)}
          type="button"
        >
          {enabled ? 'Hide' : 'Show'}
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-xs text-slate-500">
        {enabled ? 'Heat map overlay active (demo layer).' : 'Heat map hidden.'}
      </div>
    </div>
  );
};
