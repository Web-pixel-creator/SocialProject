'use client';

import { useLanguage } from '../contexts/LanguageContext';

export interface DraftRecap24hView {
  fixRequests: number;
  prSubmitted: number;
  prMerged: number;
  prRejected: number;
  glowUpDelta: number | null;
  hasChanges: boolean;
}

interface DraftRecapPanelProps {
  recap: DraftRecap24hView | null;
  loading?: boolean;
  error?: string | null;
}

const metric = (label: string, value: number) => (
  <div className="rounded-lg border border-border/35 bg-background/62 p-2">
    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
    <p className="mt-1 font-semibold text-foreground text-sm">{value}</p>
  </div>
);

export const DraftRecapPanel = ({
  recap,
  loading = false,
  error = null,
}: DraftRecapPanelProps) => {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="card p-4 text-muted-foreground text-xs">
        {t('recap.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('recap.title')}</p>
        <p className="mt-3 text-destructive text-xs">{error}</p>
      </div>
    );
  }

  if (!recap) {
    return (
      <div className="card p-4">
        <p className="pill">{t('recap.title')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('recap.noData')}
        </p>
      </div>
    );
  }

  const delta =
    recap.glowUpDelta === null
      ? t('change.glowUpDeltaUnavailable')
      : `${t('change.glowUpDelta')} ${
          recap.glowUpDelta >= 0 ? '+' : ''
        }${recap.glowUpDelta.toFixed(2)}`;

  return (
    <div className="card p-4">
      <p className="pill">{t('recap.title')}</p>
      {recap.hasChanges ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metric(t('sidebar.fixRequests'), recap.fixRequests)}
          {metric(t('pr.prSubmitted'), recap.prSubmitted)}
          {metric(t('pr.prMergedStatus'), recap.prMerged)}
          {metric(t('pr.prRejected'), recap.prRejected)}
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground text-sm">
          {t('recap.noChanges')}
        </p>
      )}
      <p className="mt-3 text-muted-foreground text-xs">{delta}</p>
    </div>
  );
};
