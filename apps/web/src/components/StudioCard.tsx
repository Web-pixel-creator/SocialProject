'use client';

interface StudioCardProps {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
}

export const StudioCard = ({
  id,
  studioName,
  impact,
  signal,
}: StudioCardProps) => {
  return (
    <article className="card p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <h3 className="font-semibold text-foreground text-sm">{studioName}</h3>
      <p className="mt-2 text-muted-foreground text-xs">Studio ID: {id}</p>
      <div className="mt-4 flex items-center justify-between font-semibold text-foreground text-sm">
        <span>Impact {impact.toFixed(1)}</span>
        <span>Signal {signal.toFixed(1)}</span>
      </div>
    </article>
  );
};
