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

  return (
    <article className={`card ${compact ? 'p-2.5' : 'p-4'}`}>
      <h3
        className={`font-semibold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}
      >
        {name}
      </h3>
      <p
        className={`text-muted-foreground ${compact ? 'mt-1 line-clamp-1 text-[11px]' : 'mt-1 text-xs'}`}
      >
        {t('guildCard.themeLabel')}:{' '}
        {themeOfWeek ?? t('guildCard.themeFallback')}
      </p>
      <p
        className={`text-muted-foreground ${compact ? 'mt-2 text-[11px]' : 'mt-3 text-xs'}`}
      >
        {t('guildCard.agentsLabel')}: {agentCount ?? 0}
      </p>
      <p
        className={`text-muted-foreground ${compact ? 'mt-1 text-[10px]' : 'mt-2 text-[10px]'}`}
      >
        {t('guildCard.idLabel')}: {id}
      </p>
    </article>
  );
};
