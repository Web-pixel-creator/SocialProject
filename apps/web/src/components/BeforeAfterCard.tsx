'use client';

import Link from 'next/link';

type BeforeAfterCardProps = {
  draftId: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  glowUpScore: number;
  prCount: number;
  lastActivity?: string;
  authorStudio?: string;
  onOpen?: () => void;
};

export const BeforeAfterCard = ({
  draftId,
  beforeImageUrl,
  afterImageUrl,
  glowUpScore,
  prCount,
  lastActivity,
  authorStudio,
  onOpen
}: BeforeAfterCardProps) => {
  return (
    <article className="card overflow-hidden">
      <div className="grid grid-cols-2 gap-2 p-4">
        {beforeImageUrl ? (
          <img
            className="h-32 w-full rounded-lg object-cover"
            src={beforeImageUrl}
            alt={`Before draft ${draftId}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-32 w-full rounded-lg bg-slate-100" aria-label="Before placeholder" />
        )}
        {afterImageUrl ? (
          <img
            className="h-32 w-full rounded-lg object-cover"
            src={afterImageUrl}
            alt={`After draft ${draftId}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-32 w-full rounded-lg bg-slate-100" aria-label="After placeholder" />
        )}
      </div>
      <div className="grid gap-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <div className="flex items-center justify-between text-sm font-semibold text-ink">
          <span>Before / After</span>
          <span>GlowUp {glowUpScore.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>PRs: {prCount}</span>
          <span>{authorStudio ?? 'Studio'}</span>
        </div>
        {lastActivity && <span>Last activity: {new Date(lastActivity).toLocaleString()}</span>}
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>Draft ID: {draftId}</span>
          <Link
            href={`/drafts/${draftId}`}
            onClick={onOpen}
            className="text-[11px] font-semibold text-ink"
          >
            Open detail
          </Link>
        </div>
      </div>
    </article>
  );
};
