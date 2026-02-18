'use client';

import useSWR from 'swr';
import { apiClient } from '../lib/api';

type CreatorStudioStatus = 'draft' | 'active' | 'paused';

interface CreatorStudioSummary {
  id: string;
  studioName: string;
  tagline: string;
  status: CreatorStudioStatus;
  revenueSharePercent: number;
  retentionScore: number;
}

const fallbackStudios: CreatorStudioSummary[] = [
  {
    id: 'fallback-creator-1',
    studioName: 'Prompt Forge',
    tagline: 'Human-led cinematic prompt systems',
    status: 'active',
    revenueSharePercent: 18,
    retentionScore: 72,
  },
  {
    id: 'fallback-creator-2',
    studioName: 'Arc Lab',
    tagline: 'Micro-story driven visual experiments',
    status: 'draft',
    revenueSharePercent: 15,
    retentionScore: 41,
  },
];

const statusClassByValue: Record<CreatorStudioStatus, string> = {
  active: 'border border-chart-2/45 bg-chart-2/12 text-chart-2',
  draft: 'border border-primary/35 bg-primary/10 text-primary',
  paused: 'border border-muted-foreground/35 bg-muted/45 text-muted-foreground',
};

const fetchCreatorStudios = async (): Promise<CreatorStudioSummary[]> => {
  const response = await apiClient.get('/creator-studios', {
    params: {
      limit: 3,
      status: 'active',
    },
  });

  if (!Array.isArray(response.data)) {
    return [];
  }

  return response.data.map((item: Record<string, unknown>) => ({
    id: String(item.id ?? ''),
    studioName: String(item.studioName ?? 'Untitled creator studio'),
    tagline: String(item.tagline ?? 'No tagline yet'),
    status: (item.status as CreatorStudioStatus) ?? 'draft',
    revenueSharePercent: Number(item.revenueSharePercent ?? 15),
    retentionScore: Number(item.retentionScore ?? 0),
  }));
};

export const CreatorStudiosRail = () => {
  const { data, isLoading } = useSWR<CreatorStudioSummary[]>(
    'feed-creator-studios',
    fetchCreatorStudios,
    {
      fallbackData: fallbackStudios,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: 60_000,
    },
  );

  const studios = data ?? fallbackStudios;

  return (
    <section className="card p-4" data-testid="creator-studios-rail">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Creator toolkit
        </h3>
        <span className="pill">{studios.length}</span>
      </header>
      <p className="mt-2 text-muted-foreground text-xs">
        Human-run agent studios with governance rules and revenue-share setup.
      </p>

      <div className="mt-3 grid gap-2">
        {studios.length === 0 && !isLoading ? (
          <p className="rounded-lg border border-border/30 bg-background/45 px-3 py-2 text-muted-foreground text-xs">
            No active creator studios yet.
          </p>
        ) : null}

        {studios.map((studio) => (
          <article
            className="rounded-lg border border-border/30 bg-background/42 px-3 py-2"
            key={studio.id}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-1 font-semibold text-foreground text-xs">
                {studio.studioName}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide ${statusClassByValue[studio.status] ?? statusClassByValue.draft}`}
              >
                {studio.status}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
              {studio.tagline}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="pill">Share {studio.revenueSharePercent}%</span>
              <span className="pill">
                Retention {studio.retentionScore.toFixed(0)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
