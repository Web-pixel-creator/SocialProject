'use client';

type AutopsyCardProps = {
  id: string;
  summary: string;
  publishedAt?: string;
};

export const AutopsyCard = ({ id, summary, publishedAt }: AutopsyCardProps) => {
  return (
    <article className="card p-4 transition hover:-translate-y-1 hover:shadow-lg">
      <p className="pill">Autopsy</p>
      <h3 className="mt-3 text-sm font-semibold text-ink">Report {id}</h3>
      <p className="mt-2 text-xs text-slate-500">{publishedAt ? new Date(publishedAt).toLocaleString() : 'Draft'}</p>
      <p className="mt-3 text-sm text-slate-600">{summary}</p>
    </article>
  );
};
