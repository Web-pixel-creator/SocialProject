'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type Dispatch,
  type SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
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
import { useLastSuccessfulValue } from '../../lib/useLastSuccessfulValue';

interface SearchResult {
  id: string;
  type: 'draft' | 'release' | 'studio';
  title: string;
  score: number;
  glowUpScore?: number;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

interface VisualSearchPayload {
  draftId: string;
  embedding: number[] | null;
  tags: string[];
  type: string;
}

type VisualSearchOutcome =
  | { status: 'ok'; items: SearchResult[] }
  | { status: 'embedding_not_found' };

type VisualSearchType = 'all' | 'draft' | 'release';

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

let cachedVisitorId: string | null = null;

const updateStateIfChanged = <T,>(
  setState: Dispatch<SetStateAction<T>>,
  nextValue: T,
) => {
  setState((previousValue) =>
    Object.is(previousValue, nextValue) ? previousValue : nextValue,
  );
};

const resolveVisitorId = () => {
  const key = 'searchVisitorId';
  const stored = window.localStorage.getItem(key);
  if (stored) {
    cachedVisitorId = stored;
    return stored;
  }

  if (cachedVisitorId) {
    window.localStorage.setItem(key, cachedVisitorId);
    return cachedVisitorId;
  }

  const generated =
    window.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const created = generated.toLowerCase();
  window.localStorage.setItem(key, created);
  cachedVisitorId = created;
  return created;
};

const sendTelemetry = (payload: Record<string, unknown>): void => {
  apiClient.post('/telemetry/ux', payload).catch(() => {
    // ignore telemetry failures
  });
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

const parseVisualType = (value: string): VisualSearchType =>
  value === 'draft' || value === 'release' ? value : 'all';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return target.getAttribute('role') === 'textbox';
};

const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function SearchPageContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode =
    searchParams?.get('mode') === 'visual' ? 'visual' : 'text';
  const initialQuery = searchParams?.get('q') ?? '';
  const initialType = searchParams?.get('type') ?? 'all';
  const initialVisualType = parseVisualType(initialType);
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
    initialMode === 'visual' ? initialVisualType : 'all',
  );
  const [visualNotice, setVisualNotice] = useState<string | null>(null);
  const [visualHasSearched, setVisualHasSearched] = useState(false);
  const [visualInputError, setVisualInputError] = useState<string | null>(null);
  const [textSearchReady, setTextSearchReady] = useState(false);
  const textSearchInputRef = useRef<HTMLInputElement>(null);
  const [debouncedText, setDebouncedText] = useState({
    intent: initialIntent,
    profile: SEARCH_DEFAULT_PROFILE as SearchProfile,
    query: initialQuery,
    range: initialRange,
    sort: initialSort,
    type: initialType,
  });
  const autoRunVisual = useRef(
    initialMode === 'visual' && initialDraftId.length > 0,
  );
  const didSmoothScroll = useRef(false);
  const textTelemetrySignatureRef = useRef<string | null>(null);
  const textQueryPresets = useMemo(
    () => [
      t('search.presets.query.landingPageRedesign'),
      t('search.presets.query.promptOptimization'),
      t('search.presets.query.brandStyleGuide'),
    ],
    [t],
  );
  const visualTagPresets = useMemo(
    () => [
      t('search.presets.tag.cinematic'),
      t('search.presets.tag.minimal'),
      t('search.presets.tag.highContrast'),
    ],
    [t],
  );

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
    const validVisualType = parseVisualType(urlType);

    updateStateIfChanged(setMode, urlMode);
    updateStateIfChanged(setQuery, urlQuery);
    updateStateIfChanged(setType, urlType);
    if (urlMode === 'visual') {
      updateStateIfChanged(setVisualType, validVisualType);
    }
    updateStateIfChanged(setSort, urlSort);
    updateStateIfChanged(setRange, urlRange);
    updateStateIfChanged(setIntent, urlIntent);
    updateStateIfChanged(setVisualDraftId, urlDraftId);
    updateStateIfChanged(setVisualTags, urlTags);

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
    updateStateIfChanged(setProfile, nextProfile);
    window.localStorage.setItem(storageKey, nextProfile);
  }, [searchParams]);

  useEffect(() => {
    if (mode !== 'text') {
      return;
    }
    setTextSearchReady(false);
    const handle = window.setTimeout(() => {
      setDebouncedText({
        intent,
        profile,
        query,
        range,
        sort,
        type,
      });
      setTextSearchReady(true);
    }, 300);
    return () => {
      window.clearTimeout(handle);
    };
  }, [intent, mode, profile, query, range, sort, type]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/') {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (mode !== 'text' || isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      textSearchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode]);

  const textSearchParams = useMemo(
    () =>
      pruneUndefined({
        intent:
          debouncedText.intent === 'all' ? undefined : debouncedText.intent,
        profile:
          debouncedText.profile === 'balanced'
            ? undefined
            : debouncedText.profile,
        q: debouncedText.query,
        range: debouncedText.range === 'all' ? undefined : debouncedText.range,
        sort: debouncedText.sort,
        type: debouncedText.type === 'all' ? undefined : debouncedText.type,
      }),
    [debouncedText],
  );

  const textSearchKey =
    mode === 'text' && textSearchReady
      ? `search:text:${JSON.stringify(textSearchParams)}`
      : null;

  const {
    data: textResults,
    error: textSearchError,
    isLoading: textSearchIsLoading,
    isValidating: textSearchIsValidating,
    mutate: mutateTextSearch,
  } = useSWR<SearchResult[]>(
    textSearchKey,
    async () => {
      const response = await apiClient.get('/search', {
        params: textSearchParams,
      });
      return response.data ?? [];
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const {
    data: visualSearchOutcome,
    error: visualSearchError,
    isMutating: visualSearchIsMutating,
    reset: resetVisualSearch,
    trigger: triggerVisualSearch,
  } = useSWRMutation<VisualSearchOutcome, unknown, string, VisualSearchPayload>(
    'search:visual',
    async (_key, { arg }) => {
      try {
        const response = await apiClient.post('/search/visual', {
          draftId: arg.draftId || undefined,
          embedding: arg.embedding ?? undefined,
          tags: arg.tags.length > 0 ? arg.tags : undefined,
          type: arg.type === 'all' ? undefined : arg.type,
        });
        return { status: 'ok', items: response.data ?? [] };
      } catch (error: unknown) {
        const code = getApiErrorCode(error);
        if (code === 'EMBEDDING_NOT_FOUND') {
          return { status: 'embedding_not_found' };
        }
        throw error;
      }
    },
  );

  useEffect(() => {
    if (mode !== 'text' || !textResults) {
      return;
    }
    const signature = JSON.stringify({
      intent: debouncedText.intent,
      mode: 'text',
      profile: debouncedText.profile,
      q: debouncedText.query,
      range: debouncedText.range,
      resultCount: textResults.length,
      sort: debouncedText.sort,
      type: debouncedText.type,
    });
    if (textTelemetrySignatureRef.current === signature) {
      return;
    }
    textTelemetrySignatureRef.current = signature;
    sendTelemetry({
      eventType: 'search_performed',
      intent: debouncedText.intent === 'all' ? undefined : debouncedText.intent,
      metadata: {
        mode: 'text',
        profile: debouncedText.profile,
        queryLength: debouncedText.query.length,
        resultCount: textResults.length,
      },
      range: debouncedText.range === 'all' ? undefined : debouncedText.range,
      sort: debouncedText.sort,
      status: debouncedText.type === 'all' ? undefined : debouncedText.type,
    });
  }, [debouncedText, mode, textResults]);

  useEffect(() => {
    if (!(mode === 'text' || mode === 'visual')) {
      return;
    }
    textTelemetrySignatureRef.current = null;
    setVisualInputError(null);
    setVisualNotice(null);
    setVisualHasSearched(false);
    resetVisualSearch();
  }, [mode, resetVisualSearch]);

  const textError =
    mode === 'text' && textSearchError
      ? getApiErrorMessage(textSearchError, t('search.errors.searchFailed'))
      : null;
  const visualError =
    mode === 'visual' && visualSearchError
      ? getApiErrorMessage(
          visualSearchError,
          t('search.errors.visualSearchFailed'),
        )
      : null;
  const error = textError ?? visualInputError ?? visualError;
  const loading =
    mode === 'text'
      ? textSearchIsLoading || textSearchIsValidating
      : visualSearchIsMutating;
  const lastSuccessfulTextResults = useLastSuccessfulValue<SearchResult[]>(
    textResults,
    mode === 'text' && Array.isArray(textResults),
    [],
  );
  const visualResultItems =
    visualSearchOutcome?.status === 'ok'
      ? visualSearchOutcome.items
      : undefined;
  const lastSuccessfulVisualResults = useLastSuccessfulValue<SearchResult[]>(
    visualResultItems,
    mode === 'visual' && Array.isArray(visualResultItems),
    [],
  );

  const visualResults =
    visualSearchOutcome?.status === 'ok'
      ? visualSearchOutcome.items
      : lastSuccessfulVisualResults;
  const visibleResults =
    mode === 'text'
      ? (textResults ?? lastSuccessfulTextResults)
      : visualResults;
  const showEmptyState = !loading && visibleResults.length === 0 && !error;
  const showResults = !(loading || showEmptyState);

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
    setVisualInputError(null);
    setVisualHasSearched(false);
  }, [mode, visualDraftId, visualEmbedding, visualTags, visualType]);

  const runVisualSearch = useCallback(async () => {
    const embedding = parseEmbedding(visualEmbedding);
    const trimmedDraftId = visualDraftId.trim();
    if (!(embedding || trimmedDraftId)) {
      setVisualInputError(t('search.errors.provideDraftOrEmbedding'));
      return;
    }
    setVisualInputError(null);
    setVisualNotice(null);
    const tags = parseTags(visualTags);
    const outcome = await triggerVisualSearch(
      {
        draftId: trimmedDraftId,
        embedding,
        tags,
        type: visualType,
      },
      { throwOnError: false },
    );
    if (!outcome) {
      return;
    }
    if (outcome.status === 'ok') {
      setVisualHasSearched(true);
      return;
    }
    setVisualNotice(t('search.visual.availableAfterAnalysis'));
  }, [
    triggerVisualSearch,
    visualDraftId,
    visualEmbedding,
    visualTags,
    visualType,
    t,
  ]);

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
  const retrySearch = useCallback(() => {
    if (mode === 'text') {
      setVisualInputError(null);
      textTelemetrySignatureRef.current = null;
      mutateTextSearch();
      return;
    }
    runVisualSearch();
  }, [mode, mutateTextSearch, runVisualSearch]);

  const resetTextFilters = useCallback(() => {
    setQuery('');
    setType('all');
    setSort('recency');
    setRange('all');
    setIntent('all');
  }, []);

  const resetVisualFilters = useCallback(() => {
    setVisualDraftId('');
    setVisualEmbedding('');
    setVisualTags('');
    setVisualType('all');
    setVisualInputError(null);
    setVisualNotice(null);
    setVisualHasSearched(false);
    resetVisualSearch();
  }, [resetVisualSearch]);

  return (
    <main className="grid gap-3 sm:gap-5">
      <div className="card p-3 sm:p-5">
        <h2 className="font-semibold text-foreground text-xl sm:text-2xl">
          {t('header.search')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('search.subtitle')}</p>
      </div>
      <div className="card grid gap-3 p-3 sm:gap-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-lg px-3 py-1.5 text-sm sm:py-2 ${focusRingClass} ${
              mode === 'text'
                ? 'border border-primary/35 bg-primary/10 text-primary'
                : 'border border-transparent bg-background/54 text-muted-foreground hover:bg-background/74 hover:text-foreground'
            }`}
            onClick={() => setMode('text')}
            type="button"
          >
            {t('search.mode.text')}
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-sm sm:py-2 ${focusRingClass} ${
              mode === 'visual'
                ? 'border border-primary/35 bg-primary/10 text-primary'
                : 'border border-transparent bg-background/54 text-muted-foreground hover:bg-background/74 hover:text-foreground'
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
              aria-keyshortcuts="/"
              className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search.placeholders.keyword')}
              ref={textSearchInputRef}
              type="search"
              value={query}
            />
            <div className="flex flex-wrap items-center gap-2">
              {textQueryPresets.map((preset) => (
                <button
                  className={`rounded-full border border-border/30 bg-muted/55 px-3 py-1 text-muted-foreground text-xs transition hover:bg-muted/75 hover:text-foreground ${focusRingClass}`}
                  key={preset}
                  onClick={() => setQuery(preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
              <button
                className={`rounded-full border border-border/30 bg-muted/55 px-3 py-1 text-muted-foreground text-xs transition hover:bg-muted/75 hover:text-foreground ${focusRingClass}`}
                onClick={resetTextFilters}
                type="button"
              >
                {t('search.actions.resetFilters')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <select
                className={`w-full rounded-lg border border-border/25 bg-background/70 px-3 py-1.5 text-foreground text-sm sm:w-auto sm:py-2 ${focusRingClass}`}
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                <option value="all">{t('search.filters.allTypes')}</option>
                <option value="draft">{t('search.filters.drafts')}</option>
                <option value="release">{t('search.filters.releases')}</option>
                <option value="studio">{t('search.filters.studios')}</option>
              </select>
              <select
                className={`w-full rounded-lg border border-border/25 bg-background/70 px-3 py-1.5 text-foreground text-sm sm:w-auto sm:py-2 ${focusRingClass}`}
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
                className={`w-full rounded-lg border border-border/25 bg-background/70 px-3 py-1.5 text-foreground text-sm sm:w-auto sm:py-2 ${focusRingClass}`}
                onChange={(event) => setSort(event.target.value)}
                value={sort}
              >
                <option value="relevance">{t('search.sort.relevance')}</option>
                <option value="recency">{t('search.sort.recency')}</option>
                <option value="glowup">{t('changeCard.metrics.glowUp')}</option>
                <option value="impact">{t('search.sort.impact')}</option>
              </select>
              <select
                className={`w-full rounded-lg border border-border/25 bg-background/70 px-3 py-1.5 text-foreground text-sm sm:w-auto sm:py-2 ${focusRingClass}`}
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
              className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
              onChange={(event) => setVisualDraftId(event.target.value)}
              placeholder={t('search.placeholders.draftIdOptional')}
              value={visualDraftId}
            />
            <textarea
              className={`min-h-[96px] rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/70 sm:min-h-[120px] sm:px-4 ${focusRingClass}`}
              onChange={(event) => setVisualEmbedding(event.target.value)}
              placeholder={t('search.placeholders.embedding')}
              value={visualEmbedding}
            />
            <input
              className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
              onChange={(event) => setVisualTags(event.target.value)}
              placeholder={t('search.placeholders.styleTags')}
              value={visualTags}
            />
            <div className="flex flex-wrap items-center gap-2">
              {visualTagPresets.map((preset) => (
                <button
                  className={`rounded-full border border-border/30 bg-muted/55 px-3 py-1 text-muted-foreground text-xs transition hover:bg-muted/75 hover:text-foreground ${focusRingClass}`}
                  key={preset}
                  onClick={() => setVisualTags(preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
              <button
                className={`rounded-full border border-border/30 bg-muted/55 px-3 py-1 text-muted-foreground text-xs transition hover:bg-muted/75 hover:text-foreground ${focusRingClass}`}
                onClick={resetVisualFilters}
                type="button"
              >
                {t('search.actions.resetFilters')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <select
                className={`w-full rounded-lg border border-border/25 bg-background/70 px-3 py-1.5 text-foreground text-sm sm:w-auto sm:py-2 ${focusRingClass}`}
                onChange={(event) =>
                  setVisualType(parseVisualType(event.target.value))
                }
                value={visualType}
              >
                <option value="all">{t('search.filters.allTypes')}</option>
                <option value="draft">{t('search.filters.drafts')}</option>
                <option value="release">{t('search.filters.releases')}</option>
              </select>
              <button
                className={`w-full rounded-lg border border-primary/35 bg-primary/10 px-4 py-1.5 text-primary text-sm transition hover:border-primary/45 disabled:opacity-60 sm:w-auto sm:py-2 ${focusRingClass}`}
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

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/25 bg-background/58 p-2.5 text-muted-foreground text-xs leading-relaxed sm:p-3 sm:text-sm">
          <span>{summary}</span>
          {showAbBadge && (
            <span className="rounded-full border border-transparent bg-background/56 px-2 py-0.5 text-[11px] text-muted-foreground uppercase">
              AB {profile}
            </span>
          )}
        </div>
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
            <p>{error}</p>
            <button
              className={`mt-2 rounded-full border border-destructive/40 px-3 py-1 font-semibold text-[11px] transition hover:bg-destructive/10 disabled:opacity-60 ${focusRingClass}`}
              disabled={loading}
              onClick={retrySearch}
              type="button"
            >
              {t('common.retry')}
            </button>
          </div>
        )}
        {visualNotice && (
          <div className="rounded-xl border border-border/25 bg-background/60 p-3 text-muted-foreground text-xs">
            {visualNotice}
          </div>
        )}
        {loading ? (
          <p className="text-muted-foreground text-xs">
            {t('search.states.searching')}
          </p>
        ) : null}
        {showEmptyState ? (
          <div className="grid gap-3 rounded-xl border border-border/25 bg-background/60 p-2.5 text-muted-foreground text-sm sm:p-3">
            <p>
              {mode === 'visual' && visualHasSearched
                ? t('search.states.completedNoResults')
                : t('search.states.noResultsYet')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                onClick={
                  mode === 'visual' ? resetVisualFilters : resetTextFilters
                }
                type="button"
              >
                {t('search.actions.resetFilters')}
              </button>
              {mode === 'visual' ? (
                <button
                  className={`rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 font-semibold text-primary text-xs transition hover:border-primary/45 disabled:opacity-60 ${focusRingClass}`}
                  disabled={loading}
                  onClick={runVisualSearch}
                  type="button"
                >
                  {t('search.actions.runVisualSearch')}
                </button>
              ) : null}
              <Link
                className={`rounded-full border border-transparent bg-background/58 px-3 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 hover:text-primary ${focusRingClass}`}
                href="/feed"
              >
                {t('feed.exploreFeeds')}
              </Link>
            </div>
          </div>
        ) : null}
        {showResults ? (
          <ul className="grid gap-2.5 sm:gap-3">
            {visibleResults.map((result, index) => {
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
                  className="rounded-xl border border-border/25 bg-background/60 text-sm"
                  key={result.id}
                >
                  <Link
                    className={`block rounded-xl p-2.5 transition hover:bg-background/60 sm:p-3 ${focusRingClass}`}
                    href={href}
                    onClick={handleOpen}
                  >
                    <p className="font-semibold text-muted-foreground text-xs uppercase">
                      {result.type}
                    </p>
                    <p className="text-foreground text-sm">{result.title}</p>
                    {result.type !== 'studio' && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {result.beforeImageUrl ? (
                          <Image
                            alt={`${t('search.result.beforePreviewAlt')} ${result.id}`}
                            className="h-20 w-full rounded-lg object-cover"
                            height={80}
                            loading="lazy"
                            src={result.beforeImageUrl}
                            unoptimized
                            width={320}
                          />
                        ) : (
                          <div className="flex h-20 w-full items-center justify-center rounded-lg border border-border/30 bg-muted/55 font-semibold text-[11px] text-muted-foreground">
                            {t('common.before')}
                          </div>
                        )}
                        {result.afterImageUrl ? (
                          <Image
                            alt={`${t('search.result.afterPreviewAlt')} ${result.id}`}
                            className="h-20 w-full rounded-lg object-cover"
                            height={80}
                            loading="lazy"
                            src={result.afterImageUrl}
                            unoptimized
                            width={320}
                          />
                        ) : (
                          <div className="flex h-20 w-full items-center justify-center rounded-lg border border-border/30 bg-muted/55 font-semibold text-[11px] text-muted-foreground">
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
                        {t('changeCard.metrics.glowUp')}{' '}
                        {Number(result.glowUpScore ?? 0).toFixed(1)}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}

export default function SearchPage() {
  const { t } = useLanguage();

  return (
    <Suspense
      fallback={
        <main className="card p-4 text-muted-foreground text-sm sm:p-6">
          {t('search.states.loadingSearch')}
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
