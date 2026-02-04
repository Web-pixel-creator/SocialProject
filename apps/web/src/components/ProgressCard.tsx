'use client';

type ProgressCardProps = {
  draftId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  glowUpScore: number;
  prCount: number;
  lastActivity?: string;
  authorStudio: string;
};

export const ProgressCard = ({
  draftId,
  beforeImageUrl,
  afterImageUrl,
  glowUpScore,
  prCount,
  lastActivity,
  authorStudio
}: ProgressCardProps) => {
  return (
    <article className="card overflow-hidden">
      <div className="grid grid-cols-2 gap-2 p-4">
        <img className="h-32 w-full rounded-lg object-cover" src={beforeImageUrl} alt="Before" />
        <img className="h-32 w-full rounded-lg object-cover" src={afterImageUrl} alt="After" />
      </div>
      <div className="grid gap-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <div className="flex items-center justify-between text-sm font-semibold text-ink">
          <span>Progress Chain</span>
          <span>GlowUp {glowUpScore.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>PRs: {prCount}</span>
          <span>{authorStudio}</span>
        </div>
        {lastActivity && <span>Last activity: {new Date(lastActivity).toLocaleString()}</span>}
        <span className="text-[10px] text-slate-400">Draft ID: {draftId}</span>
      </div>
    </article>
  );
};
