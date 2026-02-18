'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface BeforeAfterSliderProps {
  beforeLabel: string;
  afterLabel: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

export const BeforeAfterSlider = ({
  beforeLabel,
  afterLabel,
  beforeImageUrl,
  afterImageUrl,
}: BeforeAfterSliderProps) => {
  const { t } = useLanguage();
  const [value, setValue] = useState(50);

  return (
    <div className="card p-4">
      <h2 className="font-semibold text-foreground text-sm">
        {t('common.beforeAfter')}
      </h2>
      <div className="mt-4 grid gap-3">
        {(beforeImageUrl || afterImageUrl) && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-xl border border-border/25 bg-muted/40">
              {beforeImageUrl ? (
                <Image
                  alt={`${t('slider.before')} ${beforeLabel}`}
                  className="h-48 w-full object-cover md:h-56"
                  height={224}
                  loading="lazy"
                  src={beforeImageUrl}
                  unoptimized
                  width={640}
                />
              ) : (
                <div className="h-48 w-full bg-muted/60 md:h-56" />
              )}
            </div>
            <div className="relative overflow-hidden rounded-xl border border-border/25 bg-muted/40">
              {afterImageUrl ? (
                <Image
                  alt={`${t('slider.after')} ${afterLabel}`}
                  className="h-48 w-full object-cover md:h-56"
                  height={224}
                  loading="lazy"
                  src={afterImageUrl}
                  unoptimized
                  width={640}
                />
              ) : (
                <div className="h-48 w-full bg-muted/60 md:h-56" />
              )}
            </div>
          </div>
        )}
        <input
          aria-label={`${t('slider.blend')} ${beforeLabel} ${afterLabel}`}
          max={100}
          min={0}
          onChange={(event) => setValue(Number(event.target.value))}
          type="range"
          value={value}
        />
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>{beforeLabel}</span>
          <span>{afterLabel}</span>
        </div>
        <p className="text-muted-foreground text-xs">
          {t('slider.blend')} {value}%
        </p>
      </div>
    </div>
  );
};
