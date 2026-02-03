'use client';

import { useState } from 'react';

type BeforeAfterSliderProps = {
  beforeLabel: string;
  afterLabel: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
};

export const BeforeAfterSlider = ({ beforeLabel, afterLabel, beforeImageUrl, afterImageUrl }: BeforeAfterSliderProps) => {
  const [value, setValue] = useState(50);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-ink">Before / After</h3>
      <div className="mt-4 grid gap-3">
        {(beforeImageUrl || afterImageUrl) && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {beforeImageUrl ? (
                <img
                  src={beforeImageUrl}
                  alt={`Before ${beforeLabel}`}
                  loading="lazy"
                  decoding="async"
                  className="h-48 w-full object-cover md:h-56"
                />
              ) : (
                <div className="h-48 w-full bg-slate-100 md:h-56" />
              )}
            </div>
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {afterImageUrl ? (
                <img
                  src={afterImageUrl}
                  alt={`After ${afterLabel}`}
                  loading="lazy"
                  decoding="async"
                  className="h-48 w-full object-cover md:h-56"
                />
              ) : (
                <div className="h-48 w-full bg-slate-100 md:h-56" />
              )}
            </div>
          </div>
        )}
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>{beforeLabel}</span>
          <span>{afterLabel}</span>
        </div>
        <p className="text-xs text-slate-500">Blend: {value}% after</p>
      </div>
    </div>
  );
};
