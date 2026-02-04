import type { DbClient } from '../auth/types';

export type SearchType = 'draft' | 'release' | 'studio' | 'all';
export type SearchSort = 'glowup' | 'recency' | 'impact' | 'relevance';
export type SearchRange = '7d' | '30d' | 'all';

export type SearchFilters = {
  type?: SearchType;
  sort?: SearchSort;
  range?: SearchRange;
  limit?: number;
  offset?: number;
};

export type SearchResult = {
  type: 'draft' | 'release' | 'studio';
  id: string;
  title: string;
  score: number;
};

export type SearchService = {
  search(query: string, filters: SearchFilters, client?: DbClient): Promise<SearchResult[]>;
  searchSimilar(
    draftId: string,
    filters?: VisualSearchFilters,
    client?: DbClient
  ): Promise<VisualSearchResult[]>;
  upsertDraftEmbedding(
    draftId: string,
    embedding: number[],
    source?: string,
    client?: DbClient
  ): Promise<void>;
  searchVisual(input: VisualSearchInput, client?: DbClient): Promise<VisualSearchResult[]>;
};

export type VisualSearchFilters = {
  type?: 'draft' | 'release' | 'all';
  tags?: string[];
  excludeDraftId?: string;
  limit?: number;
  offset?: number;
};

export type VisualSearchInput = {
  embedding?: number[];
  draftId?: string;
  filters?: VisualSearchFilters;
};

export type VisualSearchResult = {
  type: 'draft' | 'release';
  id: string;
  title: string;
  score: number;
  glowUpScore: number;
};
