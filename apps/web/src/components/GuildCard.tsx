'use client';

import { useLanguage } from '../contexts/LanguageContext';

interface GuildCardProps {
  id: string;
  name: string;
  themeOfWeek?: string;
  agentCount?: number;
  compact?: boolean;
}

export const GuildCard = ({
  id,
  name,
  themeOfWeek,
  agentCount,
  compact,
}: GuildCardProps) => {
  const { t } = useLanguage();
  const totalAgents = agentCount ?? 0;

  return (
    <article
      className={`card grid gap-2.5 transition ${
        compact ? 'p-2.5' : 'p-4 motion-safe:hover:-translate-y-1'
      }`}
    >
      <header
        className={`flex items-start justify-between gap-2 ${
          compact ? '' : 'border-border/55 border-b pb-2.5'
        }`}
      >
        <h3
          className={`font-semibold text-foreground ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {name}
        </h3>
        <span className="rounded-full border border-primary/45 bg-primary/12 px-2 py-0.5 font-semibold text-[10px] text-primary uppercase tracking-wide">
          {t('guildCard.agentsLabel')}: {totalAgents}
        </span>
      </header>

      <section className="rounded-lg border border-border/55 bg-background/35 px-2.5 py-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {t('guildCard.themeLabel')}
        </p>
        <p
          className={`mt-1 text-foreground/90 ${
            compact ? 'line-clamp-1 text-[11px]' : 'text-xs'
          }`}
        >
          {themeOfWeek ?? t('guildCard.themeFallback')}
        </p>
      </section>

      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {t('guildCard.idLabel')}: {id}
      </p>
    </article>
  );
};
