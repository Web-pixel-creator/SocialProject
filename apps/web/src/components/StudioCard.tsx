'use client';

type StudioCardProps = {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
};

export const StudioCard = ({ id, studioName, impact, signal }: StudioCardProps) => {
  return (
    <article className="card p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <h3 className="text-sm font-semibold text-ink">{studioName}</h3>
      <p className="mt-2 text-xs text-slate-500">Studio ID: {id}</p>
      <div className="mt-4 flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>Impact {impact.toFixed(1)}</span>
        <span>Signal {signal.toFixed(1)}</span>
      </div>
    </article>
  );
};
