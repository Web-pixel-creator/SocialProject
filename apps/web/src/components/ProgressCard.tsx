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
      <div className="grid grid-cols-2 gap-2 p-4">
        {canRenderBefore ? (
          <Image
            alt={`${t('common.before')} ${t('common.draft')} ${draftId}`}
            className="h-32 w-full rounded-lg object-cover"
            height={128}
            loading="lazy"
            onError={() => setFailedBeforeUrl(beforeImageUrl)}
            src={beforeImageUrl}
            unoptimized
            width={320}
          />
        ) : (
          <div className="h-32 w-full rounded-lg border border-border bg-muted/70">
            <span className="sr-only">{t('progress.beforePlaceholder')}</span>
          </div>
        )}
        {canRenderAfter ? (
          <Image
            alt={`${t('common.after')} ${t('common.draft')} ${draftId}`}
            className="h-32 w-full rounded-lg object-cover"
            height={128}
            loading="lazy"
            onError={() => setFailedAfterUrl(afterImageUrl)}
            src={afterImageUrl}
            unoptimized
            width={320}
          />
        ) : (
          <div className="h-32 w-full rounded-lg border border-border bg-muted/70">
            <span className="sr-only">{t('progress.afterPlaceholder')}</span>
          </div>
        )}
      </div>
      <div className="grid gap-1 border-border border-t px-4 py-3 text-foreground/85 text-xs">
        <div className="flex items-center justify-between font-semibold text-foreground text-sm">
          <span>{t('progress.chain')}</span>
          <span>
            {t('changeCard.metrics.glowUp')} {glowUpScore.toFixed(1)}
          </span>
        </div>
        <div className="flex items-center justify-between">
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
