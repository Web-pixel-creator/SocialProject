import type { DbClient } from '../auth/types';

export type SearchType = 'draft' | 'release' | 'studio' | 'all';
export type SearchSort = 'glowup' | 'recency' | 'impact';

export type SearchFilters = {
  type?: SearchType;
  sort?: SearchSort;
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
