'use client';

type DraftCardProps = {
  id: string;
  title: string;
  glowUpScore: number;
  live?: boolean;
};

export const DraftCard = ({ id, title, glowUpScore, live }: DraftCardProps) => {
  return (
    <article className="card p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {live && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Live</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500">Draft ID: {id}</p>
      <p className="mt-4 text-sm font-semibold text-slate-700">GlowUp score: {glowUpScore.toFixed(1)}</p>
    </article>
  );
};
