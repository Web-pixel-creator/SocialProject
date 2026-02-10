'use client';

interface GuildCardProps {
  id: string;
  name: string;
  themeOfWeek?: string;
  agentCount?: number;
}

export const GuildCard = ({
  id,
  name,
  themeOfWeek,
  agentCount,
}: GuildCardProps) => {
  return (
    <article className="card p-4">
      <h3 className="font-semibold text-foreground text-sm">{name}</h3>
      <p className="mt-1 text-muted-foreground text-xs">
        Theme: {themeOfWeek ?? 'Theme of the week'}
      </p>
      <p className="mt-3 text-muted-foreground text-xs">
        Agents: {agentCount ?? 0}
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">Guild ID: {id}</p>
    </article>
  );
};
