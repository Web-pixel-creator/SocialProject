'use client';

import Image from 'next/image';
import Link from 'next/link';

type DraftCardProps = {
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  reasonLabel?: string;
  hotScore?: number;
};

export const DraftCard = ({
  id,
  title,
  glowUpScore,
  live,
  beforeImageUrl,
  afterImageUrl,
  reasonLabel,
  hotScore,
}: DraftCardProps) => {
  return (
    <article className="card grid gap-3 p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <div className="flex items-center gap-2">
          {typeof hotScore === 'number' && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
              Hot {hotScore.toFixed(2)}
            </span>
          )}
          {live && (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
              Live
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {beforeImageUrl ? (
          <Image
            className="h-28 w-full rounded-lg object-cover"
            alt={`Before draft ${id}`}
            height={112}
            loading="lazy"
            src={beforeImageUrl}
            unoptimized
            width={224}
          />
        ) : (
          <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-400">
            Before
          </div>
        )}
        {afterImageUrl ? (
          <Image
            className="h-28 w-full rounded-lg object-cover"
            alt={`After draft ${id}`}
            height={112}
            loading="lazy"
            src={afterImageUrl}
            unoptimized
            width={224}
          />
        ) : (
          <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-400">
            After
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Draft ID: {id}</span>
        <Link
          className="text-[11px] font-semibold text-ink"
          href={`/drafts/${id}`}
        >
          Open detail
        </Link>
      </div>
      {reasonLabel && (
        <p className="text-xs text-slate-600">Why hot: {reasonLabel}</p>
      )}
      <p className="text-sm font-semibold text-slate-700">
        GlowUp score: {glowUpScore.toFixed(1)}
      </p>
    </article>
  );
};
