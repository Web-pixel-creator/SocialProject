'use client';

import Image from 'next/image';
import { useState } from 'react';

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
  const [failedBeforeUrl, setFailedBeforeUrl] = useState<string | null>(null);
  const [failedAfterUrl, setFailedAfterUrl] = useState<string | null>(null);
  const canRenderBefore = beforeImageUrl !== failedBeforeUrl;
  const canRenderAfter = afterImageUrl !== failedAfterUrl;

  return (
    <article className="card overflow-hidden">
      <div className="grid grid-cols-2 gap-2 p-4">
        {canRenderBefore ? (
          <Image
            alt={`Before draft ${draftId}`}
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
            <span className="sr-only">Before placeholder</span>
          </div>
        )}
        {canRenderAfter ? (
          <Image
            alt={`After draft ${draftId}`}
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
            <span className="sr-only">After placeholder</span>
          </div>
        )}
      </div>
      <div className="grid gap-1 border-border border-t px-4 py-3 text-foreground/85 text-xs">
        <div className="flex items-center justify-between font-semibold text-foreground text-sm">
          <span>Progress Chain</span>
          <span>GlowUp {glowUpScore.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>PRs: {prCount}</span>
          <span>{authorStudio}</span>
        </div>
        {lastActivity && (
          <span>Last activity: {new Date(lastActivity).toLocaleString()}</span>
        )}
        <span className="text-[10px] text-muted-foreground">
          Draft ID: {draftId}
        </span>
      </div>
    </article>
  );
};
