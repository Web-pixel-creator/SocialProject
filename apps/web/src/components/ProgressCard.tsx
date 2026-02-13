'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface ProgressCardProps {
  draftId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  glowUpScore: number;
  prCount: number;
  lastActivity?: string;
  authorStudio: string;
}

export const ProgressCard = ({
  draftId,
  beforeImageUrl,
  afterImageUrl,
  glowUpScore,
  prCount,
  lastActivity,
  authorStudio,
}: ProgressCardProps) => {
  const { t } = useLanguage();
  const [failedBeforeUrl, setFailedBeforeUrl] = useState<string | null>(null);
  const [failedAfterUrl, setFailedAfterUrl] = useState<string | null>(null);
  const canRenderBefore = beforeImageUrl !== failedBeforeUrl;
  const canRenderAfter = afterImageUrl !== failedAfterUrl;

  return (
    <article className="card overflow-hidden">
      <div className="grid grid-cols-2 gap-2 border-border/60 border-b bg-background/25 p-4">
        <div className="relative">
          {canRenderBefore ? (
            <Image
              alt={`${t('common.before')} ${t('common.draft')} ${draftId}`}
              className="h-32 w-full rounded-lg border border-border/70 object-cover"
              height={128}
              loading="lazy"
              onError={() => setFailedBeforeUrl(beforeImageUrl)}
              src={beforeImageUrl}
              unoptimized
              width={320}
            />
          ) : (
            <div className="h-32 w-full rounded-lg border border-border/80 bg-muted/55">
              <span className="sr-only">{t('progress.beforePlaceholder')}</span>
            </div>
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded-full border border-border/80 bg-background/80 px-2 py-0.5 font-semibold text-[10px] text-foreground">
            {t('common.before')}
          </span>
        </div>
        <div className="relative">
          {canRenderAfter ? (
            <Image
              alt={`${t('common.after')} ${t('common.draft')} ${draftId}`}
              className="h-32 w-full rounded-lg border border-border/70 object-cover"
              height={128}
              loading="lazy"
              onError={() => setFailedAfterUrl(afterImageUrl)}
              src={afterImageUrl}
              unoptimized
              width={320}
            />
          ) : (
            <div className="h-32 w-full rounded-lg border border-border/80 bg-muted/55">
              <span className="sr-only">{t('progress.afterPlaceholder')}</span>
            </div>
          )}
          <span className="absolute right-1.5 bottom-1.5 rounded-full border border-border/80 bg-background/80 px-2 py-0.5 font-semibold text-[10px] text-foreground">
            {t('common.after')}
          </span>
        </div>
      </div>
      <div className="grid gap-1.5 px-4 py-3 text-foreground/85 text-xs">
        <div className="flex items-center justify-between font-semibold text-foreground text-sm">
          <span>{t('progress.chain')}</span>
          <span className="text-secondary">
            {t('changeCard.metrics.glowUp')} {glowUpScore.toFixed(1)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/35 px-2.5 py-1.5">
          <span>
            {t('feedTabs.metrics.prs')}: {prCount}
          </span>
          <span>{authorStudio}</span>
        </div>
        {lastActivity && (
          <span>
            {t('feedTabs.lastActivity')}:{' '}
            {new Date(lastActivity).toLocaleString()}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {t('feedTabs.draftId')}: {draftId}
        </span>
      </div>
    </article>
  );
};
