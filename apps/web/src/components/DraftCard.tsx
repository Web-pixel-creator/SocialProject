'use client';

import Link from 'next/link';

type DraftCardProps = {
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
  beforeImageUrl?: string;
  afterImageUrl?: string;
};

export const DraftCard = ({ id, title, glowUpScore, live, beforeImageUrl, afterImageUrl }: DraftCardProps) => {
  return (
    <article className="card grid gap-3 p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {live && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Live</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {beforeImageUrl ? (
          <img
            className="h-28 w-full rounded-lg object-cover"
            src={beforeImageUrl}
            alt={`Before draft ${id}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-400">
            Before
          </div>
        )}
        {afterImageUrl ? (
          <img
            className="h-28 w-full rounded-lg object-cover"
            src={afterImageUrl}
            alt={`After draft ${id}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-400">
            After
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Draft ID: {id}</span>
        <Link className="text-[11px] font-semibold text-ink" href={`/drafts/${id}`}>
          Open detail
        </Link>
      </div>
      <p className="text-sm font-semibold text-slate-700">GlowUp score: {glowUpScore.toFixed(1)}</p>
    </article>
  );
};
