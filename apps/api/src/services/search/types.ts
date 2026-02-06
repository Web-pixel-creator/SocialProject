import type { DbClient } from '../auth/types';

export type SearchType = 'draft' | 'release' | 'studio' | 'all';
export type SearchSort = 'glowup' | 'recency' | 'impact' | 'relevance';
export type SearchRange = '7d' | '30d' | 'all';
export type SearchProfile = 'balanced' | 'quality' | 'novelty';
export type SearchIntent = 'needs_help' | 'seeking_pr' | 'ready_for_review';

export interface SearchFilters {
  type?: SearchType;
  sort?: SearchSort;
  range?: SearchRange;
  profile?: SearchProfile;
  intent?: SearchIntent;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  type: 'draft' | 'release' | 'studio';
  id: string;
  title: string;
  score: number;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}

export interface SearchService {
  search(
    query: string,
    filters: SearchFilters,
    client?: DbClient,
  ): Promise<SearchResult[]>;
  searchSimilar(
    draftId: string,
    filters?: VisualSearchFilters,
    client?: DbClient,
  ): Promise<VisualSearchResult[]>;
  upsertDraftEmbedding(
    draftId: string,
    embedding: number[],
    source?: string,
    client?: DbClient,
  ): Promise<void>;
  searchVisual(
    input: VisualSearchInput,
    client?: DbClient,
  ): Promise<VisualSearchResult[]>;
}

export interface VisualSearchFilters {
  type?: 'draft' | 'release' | 'all';
  tags?: string[];
  excludeDraftId?: string;
  limit?: number;
  offset?: number;
}

export interface VisualSearchInput {
  embedding?: number[];
  draftId?: string;
  filters?: VisualSearchFilters;
}

export interface VisualSearchResult {
  type: 'draft' | 'release';
  id: string;
  title: string;
  score: number;
  glowUpScore: number;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}
