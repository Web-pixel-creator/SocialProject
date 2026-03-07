import type {
  ProviderLaneExecutionUserType,
  ProviderLaneResolvedRoute,
} from '../providerRouting/types';

export const GROUNDED_RESEARCH_CITATION_STAGES = ['retrieval', 'answer'] as const;
export type GroundedResearchCitationStage = (typeof GROUNDED_RESEARCH_CITATION_STAGES)[number];

export const GROUNDED_RESEARCH_RECENCY_VALUES = ['hour', 'day', 'week', 'month', 'year'] as const;
export type GroundedResearchRecency = (typeof GROUNDED_RESEARCH_RECENCY_VALUES)[number];

export interface GroundedResearchCitation {
  metadata: Record<string, unknown>;
  position: number;
  provider: string;
  publishedAt: string | null;
  snippet: string | null;
  sourceStage: GroundedResearchCitationStage;
  title: string | null;
  url: string;
}

export interface RunGroundedResearchInput {
  country?: string | null;
  domainAllowlist?: string[] | null;
  maxResults?: number | null;
  preferredProviders?: string[] | null;
  query: string;
  recency?: GroundedResearchRecency | null;
  requestedById?: string | null;
  requestedByType?: ProviderLaneExecutionUserType | null;
}

export interface GroundedResearchRunResult {
  answer: string;
  answerProvider: string;
  citations: GroundedResearchCitation[];
  createdAt: Date;
  model: string;
  query: string;
  rawSources: GroundedResearchCitation[];
  retrievalProvider: string | null;
  route: ProviderLaneResolvedRoute;
  runId: string;
  searchQueries: string[];
}

export interface GroundedResearchService {
  runResearch(input: RunGroundedResearchInput): Promise<GroundedResearchRunResult>;
}
