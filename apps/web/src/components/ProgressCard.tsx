'use client';

import Image from 'next/image';

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
  return (
    <article className="card overflow-hidden">
      <div className="grid grid-cols-2 gap-2 p-4">
        <Image
          alt={`Before draft ${draftId}`}
          className="h-32 w-full rounded-lg object-cover"
          height={128}
          loading="lazy"
          src={beforeImageUrl}
          unoptimized
          width={320}
        />
        <Image
          alt={`After draft ${draftId}`}
          className="h-32 w-full rounded-lg object-cover"
          height={128}
          loading="lazy"
          src={afterImageUrl}
          unoptimized
          width={320}
        />
      </div>
      <div className="grid gap-1 border-slate-100 border-t px-4 py-3 text-slate-600 text-xs">
        <div className="flex items-center justify-between font-semibold text-ink text-sm">
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
        <span className="text-[10px] text-slate-400">Draft ID: {draftId}</span>
      </div>
    </article>
  );
};
