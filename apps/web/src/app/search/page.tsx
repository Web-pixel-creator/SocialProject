'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiClient } from '../../lib/api';
import {
  SEARCH_AB_ENABLED,
  SEARCH_AB_WEIGHTS,
  SEARCH_DEFAULT_PROFILE,
} from '../../lib/config';
import { getApiErrorCode, getApiErrorMessage } from '../../lib/errors';
import {
  assignAbProfile,
  parseSearchProfile,
  type SearchProfile,
} from '../../lib/searchProfiles';

interface SearchResult {
  id: string;
  type: 'draft' | 'release' | 'studio';
  title: string;
  score: number;
  glowUpScore?: number;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

const normalizeParams = (params: URLSearchParams) => {
  const entries = Array.from(params.entries()).sort(
    ([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) {
        return aValue.localeCompare(bValue);
      }
      return aKey.localeCompare(bKey);
    },
  );
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
};

const resolveVisitorId = () => {
  const key = 'searchVisitorId';
  const stored = window.localStorage.getItem(key);
  if (stored) {
    return stored;
  }

  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(key, created);
  return created;
};

const sendTelemetry = async (payload: Record<string, unknown>) => {
  try {
    await apiClient.post('/telemetry/ux', payload);
  } catch (_error) {
    // ignore telemetry failures
  }
};

const pruneUndefined = <T extends Record<string, unknown>>(input: T) =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

const parseEmbedding = (value: string) => {
  if (!value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const normalized = parsed
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
};

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const TEXT_QUERY_PRESETS = [
  'Landing page redesign',
  'Prompt optimization',
  'Brand style guide',
];

const VISUAL_TAG_PRESETS = ['cinematic', 'minimal', 'high contrast'];

function SearchPageContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode =
    searchParams?.get('mode') === 'visual' ? 'visual' : 'text';
  const initialQuery = searchParams?.get('q') ?? '';
  const initialType = searchParams?.get('type') ?? 'all';
  const initialSort = searchParams?.get('sort') ?? 'recency';
  const initialRange = searchParams?.get('range') ?? 'all';
  const initialIntent = searchParams?.get('intent') ?? 'all';
  const initialDraftId = searchParams?.get('draftId') ?? '';
  const initialTags = searchParams?.get('tags') ?? '';
  const abRequested = searchParams?.get('ab') === '1';
  const abEnabled = abRequested && SEARCH_AB_ENABLED;

  const [mode, setMode] = useState<'text' | 'visual'>(initialMode);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [sort, setSort] = useState(initialSort);
  const [range, setRange] = useState(initialRange);
  const [intent, setIntent] = useState(initialIntent);
  const [profile, setProfile] = useState<SearchProfile>(SEARCH_DEFAULT_PROFILE);
  const [visualDraftId, setVisualDraftId] = useState(initialDraftId);
  const [visualEmbedding, setVisualEmbedding] = useState('');
  const [visualTags, setVisualTags] = useState(initialTags);
  const [visualType, setVisualType] = useState(
    initialMode === 'visual' ? initialType : 'all',
  );
  const [visualNotice, setVisualNotice] = useState<string | null>(null);
  const [visualHasSearched, setVisualHasSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoRunVisual = useRef(
    initialMode === 'visual' && initialDraftId.length > 0,
  );
  const didSmoothScroll = useRef(false);

  useEffect(() => {
    if (!searchParams) {
      return;
    }
    const urlMode = searchParams.get('mode') === 'visual' ? 'visual' : 'text';
    const urlQuery = searchParams.get('q') ?? '';
    const urlType = searchParams.get('type') ?? 'all';
    const urlSort = searchParams.get('sort') ?? 'recency';
    const urlRange = searchParams.get('range') ?? 'all';
    const urlIntent = searchParams.get('intent') ?? 'all';
    const urlDraftId = searchParams.get('draftId') ?? '';
    const urlTags = searchParams.get('tags') ?? '';
    const urlProfile = searchParams.get('profile') ?? '';
    const urlAb = searchParams.get('ab') ?? '';
    const urlFrom = searchParams.get('from') ?? '';
    const validVisualType =
      urlType === 'draft' || urlType === 'release' ? urlType : 'all';

    setMode(urlMode);
    setQuery(urlQuery);
    setType(urlType);
    if (urlMode === 'visual') {
      setVisualType(validVisualType);
    }
    setSort(urlSort);
    setRange(urlRange);
    setIntent(urlIntent);
    setVisualDraftId(urlDraftId);
    setVisualTags(urlTags);

    if (urlFrom === 'similar' && !didSmoothScroll.current) {
      didSmoothScroll.current = true;
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    if (urlMode === 'visual' && urlDraftId.trim().length > 0) {
      autoRunVisual.current = true;
    }

    const abMode = urlAb === '1' && SEARCH_AB_ENABLED;
    const storageKey = abMode ? 'searchAbProfile' : 'searchProfile';
    const storedProfile = parseSearchProfile(
      window.localStorage.getItem(storageKey),
    );
    const queryProfile = abMode ? null : parseSearchProfile(urlProfile);
    const assignedAbProfile = assignAbProfile(
      resolveVisitorId(),
      SEARCH_AB_WEIGHTS,
    );
    const nextProfile = abMode
      ? (storedProfile ?? assignedAbProfile)
      : (queryProfile ?? storedProfile ?? SEARCH_DEFAULT_PROFILE);
    setProfile(nextProfile);
    window.localStorage.setItem(storageKey, nextProfile);
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode === 'visual') {
      params.set('mode', 'visual');
    }
    if (mode === 'text' && query.trim()) {
      params.set('q', query.trim());
    }
    const effectiveType = mode === 'visual' ? visualType : type;
    if (effectiveType !== 'all') {
      params.set('type', effectiveType);
    }
    if (mode === 'text' && sort !== 'recency') {
      params.set('sort', sort);
    }
    if (mode === 'text' && range !== 'all') {
      params.set('range', range);
    }
    if (mode === 'visual' && visualDraftId.trim()) {
      params.set('draftId', visualDraftId.trim());
    }
    if (mode === 'visual' && visualTags.trim()) {
      params.set('tags', visualTags.trim());
    }
    if (searchParams?.get('from') === 'similar') {
      params.set('from', 'similar');
    }
    if (profile !== 'balanced') {
      params.set('profile', profile);
    }
    if (mode === 'text' && intent !== 'all') {
      params.set('intent', intent);
    }
    if (abEnabled) {
      params.set('ab', '1');
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams?.toString() ?? '';
    if (
      normalizeParams(params) ===
      normalizeParams(new URLSearchParams(currentQuery))
    ) {
      return;
    }
    router.replace(nextQuery ? `/search?${nextQuery}` : '/search', {
      scroll: false,
    });
  }, [
    mode,
    query,
    type,
    sort,
    range,
    intent,
    profile,
    visualDraftId,
    visualTags,
    visualType,
    abEnabled,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (mode !== 'text') {
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get('/search', {
          params: pruneUndefined({
            q: query,
            type: type === 'all' ? undefined : type,
            sort,
            range: range === 'all' ? undefined : range,
            intent: intent === 'all' ? undefined : intent,
            profile: profile === 'balanced' ? undefined : profile,
          }),
        });
        if (!cancelled) {
          setResults(response.data ?? []);
          sendTelemetry({
            eventType: 'search_performed',
            sort,
            status: type === 'all' ? undefined : type,
            range: range === 'all' ? undefined : range,
            intent: intent === 'all' ? undefined : intent,
            metadata: {
              profile,
              mode: 'text',
              queryLength: query.length,
              resultCount: Array.isArray(response.data)
                ? response.data.length
                : 0,
            },
          });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setError(getApiErrorMessage(error, t('search.errors.searchFailed')));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [mode, query, type, sort, range, intent, profile, t]);

  useEffect(() => {
    if (!(mode === 'text' || mode === 'visual')) {
      return;
    }
    setResults([]);
    setError(null);
    setVisualNotice(null);
    setVisualHasSearched(false);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'text') {
      return;
    }
    if (type === 'studio' && intent !== 'all') {
      setIntent('all');
    }
  }, [mode, type, intent]);

  useEffect(() => {
    if (mode !== 'visual') {
      return;
    }
    const hasVisualInput =
      visualDraftId.trim().length > 0 ||
      visualEmbedding.trim().length > 0 ||
      visualTags.trim().length > 0 ||
      visualType !== 'all';
    if (!hasVisualInput) {
      setVisualHasSearched(false);
      return;
    }
    setVisualHasSearched(false);
  }, [mode, visualDraftId, visualEmbedding, visualTags, visualType]);

  const runVisualSearch = useCallback(async () => {
    const embedding = parseEmbedding(visualEmbedding);
    const trimmedDraftId = visualDraftId.trim();
    if (!(embedding || trimmedDraftId)) {
      setError(t('search.errors.provideDraftOrEmbedding'));
      return;
    }
    setLoading(true);
    setError(null);
    setVisualNotice(null);
    try {
      const tags = parseTags(visualTags);
      const response = await apiClient.post('/search/visual', {
        embedding: embedding ?? undefined,
        draftId: trimmedDraftId || undefined,
        type: visualType === 'all' ? undefined : visualType,
        tags: tags.length > 0 ? tags : undefined,
      });
      setResults(response.data ?? []);
      setVisualHasSearched(true);
    } catch (error: unknown) {
      const code = getApiErrorCode(error);
      if (code === 'EMBEDDING_NOT_FOUND') {
        setResults([]);
        setVisualNotice(t('search.visual.availableAfterAnalysis'));
      } else {
        setError(
          getApiErrorMessage(error, t('search.errors.visualSearchFailed')),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [visualDraftId, visualEmbedding, visualTags, visualType, t]);

  useEffect(() => {
    if (mode !== 'visual') {
      return;
    }
    if (!autoRunVisual.current) {
      return;
    }
    if (!visualDraftId.trim()) {
      return;
    }
    autoRunVisual.current = false;
    sendTelemetry({
      eventType: 'similar_search_view',
      draftId: visualDraftId.trim(),
      source: 'search_prefill',
      metadata: { mode: 'visual', profile },
    });
    runVisualSearch();
  }, [mode, profile, runVisualSearch, visualDraftId]);

  const summary =
    mode === 'text'
      ? `${t('search.summary.resultsFor')} "${query || '...'}" | ${t('search.summary.type')} ${type} | ${t('search.summary.intent')} ${intent} | ${t('search.summary.sortedBy')} ${sort} | ${t('search.summary.range')} ${range}`
      : `${t('search.summary.visualResults')} | ${t('search.summary.type')} ${visualType}${
          visualDraftId.trim()
            ? ` | ${t('search.summary.draftLower')} ${visualDraftId.trim()}`
            : ''
        }${
          visualTags.trim()
            ? ` | ${t('search.summary.tags')} ${visualTags.trim()}`
            : ''
        }`;
  const showAbBadge = abEnabled;

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-foreground">
          {t('header.search')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('search.subtitle')}</p>
      </div>
      <div className="card grid gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === 'text'
                ? 'border border-primary/50 bg-primary/15 text-primary'
                : 'border border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            onClick={() => setMode('text')}
            type="button"
          >
            {t('search.mode.text')}
          </button>
          <button
            className={`rounded-lg px-3 py-2 text-sm ${
              mode === 'visual'
                ? 'border border-primary/50 bg-primary/15 text-primary'
                : 'border border-border bg-muted/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            onClick={() => setMode('visual')}
            type="button"
          >
            {t('search.mode.visual')}
          </button>
        </div>

        {mode === 'text' ? (
          <>
            <input
              className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search.placeholders.keyword')}
              value={query}
            />
            <div className="flex flex-wrap items-center gap-2">
              {TEXT_QUERY_PRESETS.map((preset) => (
                <button
                  className="rounded-full border border-border bg-muted/70 px-3 py-1 text-muted-foreground text-xs transition hover:border-primary/40 hover:text-foreground"
                  key={preset}
                  onClick={() => setQuery(preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
              <button
                className="rounded-full border border-border bg-background/70 px-3 py-1 text-muted-foreground text-xs transition hover:border-primary/40 hover:text-foreground"
                onClick={() => {
                  setQuery('');
                  setType('all');
                  setSort('recency');
                  setRange('all');
                  setIntent('all');
                }}
                type="button"
              >
                {t('search.actions.resetFilters')}
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                <option value="all">{t('search.filters.allTypes')}</option>
                <option value="draft">{t('search.filters.drafts')}</option>
                <option value="release">{t('search.filters.releases')}</option>
                <option value="studio">{t('search.filters.studios')}</option>
              </select>
              <select
                className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
                disabled={type === 'studio'}
                onChange={(event) => setIntent(event.target.value)}
                value={intent}
              >
                <option value="all">{t('search.filters.allIntents')}</option>
                <option value="needs_help">{t('feed.needsHelp')}</option>
                <option value="seeking_pr">
                  {t('search.filters.seekingPr')}
                </option>
                <option value="ready_for_review">
                  {t('feed.readyForReview')}
                </option>
              </select>
              <select
                className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
                onChange={(event) => setSort(event.target.value)}
                value={sort}
              >
                <option value="relevance">{t('search.sort.relevance')}</option>
                <option value="recency">{t('search.sort.recency')}</option>
                <option value="glowup">GlowUp</option>
                <option value="impact">{t('search.sort.impact')}</option>
              </select>
              <select
                className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
                onChange={(event) => setRange(event.target.value)}
                value={range}
              >
                <option value="all">{t('search.range.allTime')}</option>
                <option value="7d">{t('search.range.last7Days')}</option>
                <option value="30d">{t('search.range.last30Days')}</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <input
              className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
              onChange={(event) => setVisualDraftId(event.target.value)}
              placeholder={t('search.placeholders.draftIdOptional')}
              value={visualDraftId}
            />
            <textarea
              className="min-h-[120px] rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground text-sm placeholder:text-muted-foreground/70"
              onChange={(event) => setVisualEmbedding(event.target.value)}
              placeholder={t('search.placeholders.embedding')}
              value={visualEmbedding}
            />
            <input
              className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
              onChange={(event) => setVisualTags(event.target.value)}
              placeholder={t('search.placeholders.styleTags')}
              value={visualTags}
            />
            <div className="flex flex-wrap items-center gap-2">
              {VISUAL_TAG_PRESETS.map((preset) => (
                <button
                  className="rounded-full border border-border bg-muted/70 px-3 py-1 text-muted-foreground text-xs transition hover:border-primary/40 hover:text-foreground"
                  key={preset}
                  onClick={() => setVisualTags(preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
              <button
                className="rounded-full border border-border bg-background/70 px-3 py-1 text-muted-foreground text-xs transition hover:border-primary/40 hover:text-foreground"
                onClick={() => {
                  setVisualDraftId('');
                  setVisualEmbedding('');
                  setVisualTags('');
                  setVisualType('all');
                }}
                type="button"
              >
                {t('search.actions.resetFilters')}
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground text-sm"
                onChange={(event) => setVisualType(event.target.value)}
                value={visualType}
              >
                <option value="all">{t('search.filters.allTypes')}</option>
                <option value="draft">{t('search.filters.drafts')}</option>
                <option value="release">{t('search.filters.releases')}</option>
              </select>
              <button
                className="rounded-lg border border-primary/45 bg-primary/15 px-4 py-2 text-primary text-sm transition hover:border-primary/70 disabled:opacity-60"
                disabled={loading}
                onClick={runVisualSearch}
                type="button"
              >
                {t('search.actions.runVisualSearch')}
              </button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('search.help.provideEither')}
            </p>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border border-dashed bg-muted/60 p-4 text-muted-foreground text-sm">
          <span>{summary}</span>
          {showAbBadge && (
            <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground uppercase">
              AB {profile}
            </span>
          )}
        </div>
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
            {error}
          </div>
        )}
        {visualNotice && (
          <div className="rounded-xl border border-border bg-muted/60 p-3 text-muted-foreground text-xs">
            {visualNotice}
          </div>
        )}
        {mode === 'visual' &&
          visualHasSearched &&
          results.length === 0 &&
          !error &&
          !visualNotice &&
          !loading && (
            <div className="rounded-xl border border-border bg-muted/60 p-3 text-muted-foreground text-xs">
              {t('search.states.completedNoResults')}
            </div>
          )}
        {loading ? (
          <p className="text-muted-foreground text-xs">
            {t('search.states.searching')}
          </p>
        ) : (
          <ul className="grid gap-3">
            {results.map((result, index) => {
              const href =
                result.type === 'studio'
                  ? `/studios/${result.id}`
                  : `/drafts/${result.id}`;
              const handleOpen = () => {
                sendTelemetry({
                  eventType: 'search_result_open',
                  draftId: result.type === 'studio' ? undefined : result.id,
                  sort: mode === 'text' ? sort : undefined,
                  status: mode === 'text' && type !== 'all' ? type : undefined,
                  range: mode === 'text' && range !== 'all' ? range : undefined,
                  metadata: {
                    mode,
                    profile: mode === 'text' ? profile : undefined,
                    resultType: result.type,
                    resultId: result.id,
                    queryLength: mode === 'text' ? query.length : 0,
                    rank: index + 1,
                  },
                });
              };

              return (
                <li
                  className="rounded-xl border border-border bg-muted/60 text-sm"
                  key={result.id}
                >
                  <Link
                    className="block rounded-xl p-3 transition hover:bg-background/70 hover:shadow-sm"
                    href={href}
                    onClick={handleOpen}
                  >
                    <p className="font-semibold text-muted-foreground text-xs uppercase">
                      {result.type}
                    </p>
                    <p className="text-foreground text-sm">{result.title}</p>
                    {result.type !== 'studio' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {result.beforeImageUrl ? (
                          <Image
                            alt="Before preview"
                            className="h-20 w-full rounded-lg object-cover"
                            height={80}
                            loading="lazy"
                            src={result.beforeImageUrl}
                            unoptimized
                            width={320}
                          />
                        ) : (
                          <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted font-semibold text-[11px] text-muted-foreground">
                            {t('common.before')}
                          </div>
                        )}
                        {result.afterImageUrl ? (
                          <Image
                            alt="After preview"
                            className="h-20 w-full rounded-lg object-cover"
                            height={80}
                            loading="lazy"
                            src={result.afterImageUrl}
                            unoptimized
                            width={320}
                          />
                        ) : (
                          <div className="flex h-20 w-full items-center justify-center rounded-lg bg-muted font-semibold text-[11px] text-muted-foreground">
                            {t('common.after')}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {t('search.result.score')}{' '}
                      {Number(result.score ?? 0).toFixed(1)}
                    </p>
                    {typeof result.glowUpScore === 'number' && (
                      <p className="text-muted-foreground text-xs">
                        GlowUp {Number(result.glowUpScore ?? 0).toFixed(1)}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="text-muted-foreground text-xs">
                {t('search.states.noResultsYet')}
              </li>
            )}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  const { t } = useLanguage();

  return (
    <Suspense
      fallback={
        <main className="card p-6 text-muted-foreground text-sm">
          {t('search.states.loadingSearch')}
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
