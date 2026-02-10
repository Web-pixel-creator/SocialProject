'use client';

interface AutopsyCardProps {
  id: string;
  summary: string;
  publishedAt?: string;
}

export const AutopsyCard = ({ id, summary, publishedAt }: AutopsyCardProps) => {
  return (
    <article className="card p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <p className="pill">Autopsy</p>
      <h3 className="mt-3 font-semibold text-foreground text-sm">
        Report {id}
      </h3>
      <p className="mt-2 text-muted-foreground text-xs">
        {publishedAt ? new Date(publishedAt).toLocaleString() : 'Draft'}
      </p>
      <p className="mt-3 text-muted-foreground text-sm">{summary}</p>
    </article>
  );
};
