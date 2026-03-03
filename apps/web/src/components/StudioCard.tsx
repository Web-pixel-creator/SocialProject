'use client';

import { useLanguage } from '../contexts/LanguageContext';

interface StudioCardProps {
  id: string;
  studioName: string;
  impact: number;
  signal: number;
  followerCount?: number;
  isFollowing?: boolean;
  isFollowPending?: boolean;
  onToggleFollow?: () => void;
  onOpenFollowingFeed?: () => void;
  compact?: boolean;
}

export const StudioCard = ({
  id,
  studioName,
  impact,
  signal,
  followerCount = 0,
  isFollowing = false,
  isFollowPending = false,
  onToggleFollow,
  onOpenFollowingFeed,
  compact,
}: StudioCardProps) => {
  const { t } = useLanguage();

  return (
    <article
      className={`card grid gap-2.5 border-input bg-card transition ${
        compact ? 'p-2.5' : 'p-4'
      }`}
    >
      <header className={compact ? '' : 'border-input border-b pb-2.5'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            className={`font-semibold text-foreground ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {studioName}
          </h3>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isFollowing && onOpenFollowingFeed ? (
              <button
                className="rounded-full border border-input bg-background px-3 py-1 font-semibold text-xs text-foreground uppercase tracking-wide transition hover:border-primary/35 hover:bg-accent/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={onOpenFollowingFeed}
                type="button"
              >
                {t('studioCard.openFollowingFeed')}
              </button>
            ) : null}
            <button
              aria-busy={isFollowPending}
              aria-pressed={isFollowing}
              className={`rounded-full border px-3 py-1 font-semibold text-xs uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                isFollowing
                  ? 'border-primary/35 bg-primary/10 text-primary'
                  : 'border-input bg-background text-muted-foreground hover:border-primary/30 hover:bg-accent/25 hover:text-foreground'
              }`}
              disabled={isFollowPending || !onToggleFollow}
              onClick={onToggleFollow}
              type="button"
            >
              {isFollowing
                ? t('draftDetail.follow.following')
                : t('observerAction.follow')}
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wide">
          {t('studioCard.idLabel')}: {id}
        </p>
        <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wide">
          {t('studioCard.followersLabel')}: {followerCount}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-input bg-background px-2.5 py-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('studioDetail.metrics.impact')}
          </p>
          <span className="sr-only">
            {t('studioDetail.metrics.impact')} {impact.toFixed(1)}
          </span>
          <p
            className={`mt-1 font-semibold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}
          >
            {impact.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg border border-input bg-background px-2.5 py-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('studioDetail.metrics.signal')}
          </p>
          <span className="sr-only">
            {t('studioDetail.metrics.signal')} {signal.toFixed(1)}
          </span>
          <p
            className={`mt-1 font-semibold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}
          >
            {signal.toFixed(1)}
          </p>
        </div>
      </div>
    </article>
  );
};

