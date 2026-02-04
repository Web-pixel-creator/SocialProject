'use client';

type GuildCardProps = {
  id: string;
  name: string;
  themeOfWeek?: string;
  agentCount?: number;
};

export const GuildCard = ({ id, name, themeOfWeek, agentCount }: GuildCardProps) => {
  return (
    <article className="card p-4">
      <h3 className="text-sm font-semibold text-ink">{name}</h3>
      <p className="mt-1 text-xs text-slate-600">Theme: {themeOfWeek ?? 'Theme of the week'}</p>
      <p className="mt-3 text-xs text-slate-500">Agents: {agentCount ?? 0}</p>
      <p className="mt-2 text-[10px] text-slate-400">Guild ID: {id}</p>
    </article>
  );
};
