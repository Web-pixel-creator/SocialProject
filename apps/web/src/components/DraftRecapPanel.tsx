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
  <div className="rounded-lg border border-border bg-background/70 p-2">
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
        {t('legacy.loading_24h_recap')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4">
        <p className="pill">{t('legacy.24h_recap')}</p>
        <p className="mt-3 text-rose-600 text-xs">{error}</p>
      </div>
    );
  }

  if (!recap) {
    return (
      <div className="card p-4">
        <p className="pill">{t('legacy.24h_recap')}</p>
        <p className="mt-3 text-muted-foreground text-xs">
          {t('legacy.no_recap_data_yet')}
        </p>
      </div>
    );
  }

  const delta =
    recap.glowUpDelta === null
      ? t('legacy.glowup_delta_unavailable')
      : `${t('legacy.glowup_delta')} ${
          recap.glowUpDelta >= 0 ? '+' : ''
        }${recap.glowUpDelta.toFixed(2)}`;

  return (
    <div className="card p-4">
      <p className="pill">{t('legacy.24h_recap')}</p>
      {recap.hasChanges ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metric(t('legacy.fix_requests_2'), recap.fixRequests)}
          {metric(t('legacy.pr_submitted'), recap.prSubmitted)}
          {metric(t('legacy.pr_merged_2'), recap.prMerged)}
          {metric(t('legacy.pr_rejected'), recap.prRejected)}
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground text-sm">
          {t('legacy.no_changes_in_24h')}
        </p>
      )}
      <p className="mt-3 text-muted-foreground text-xs">{delta}</p>
    </div>
  );
};
