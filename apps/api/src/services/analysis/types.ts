import type {
  ProviderLaneExecutionUserType,
  ProviderLaneResolvedRoute,
} from '../providerRouting/types';

export const LONG_CONTEXT_ANALYSIS_JOB_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
] as const;
export type LongContextAnalysisJobStatus = (typeof LONG_CONTEXT_ANALYSIS_JOB_STATUSES)[number];

export const LONG_CONTEXT_ANALYSIS_USE_CASES = [
  'autopsy_report',
  'style_fusion_plan',
  'moderation_review_summary',
  'roadmap_spec_analysis',
  'custom',
] as const;
export type LongContextAnalysisUseCase = (typeof LONG_CONTEXT_ANALYSIS_USE_CASES)[number];

export const LONG_CONTEXT_CACHE_TTLS = ['5m', '1h'] as const;
export type LongContextCacheTtl = (typeof LONG_CONTEXT_CACHE_TTLS)[number];

export const LONG_CONTEXT_SERVICE_TIERS = ['auto', 'standard_only'] as const;
export type LongContextServiceTier = (typeof LONG_CONTEXT_SERVICE_TIERS)[number];

export interface LongContextAnalysisJob {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheTtl: LongContextCacheTtl;
  completedAt: Date | null;
  createdAt: Date;
  draftId: string | null;
  estimatedCostUsd: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  id: string;
  inputTokens: number;
  lane: 'long_context';
  maxOutputTokens: number;
  metadata: Record<string, unknown>;
  model: string | null;
  outputTokens: number;
  prompt: string;
  provider: string | null;
  requestedById: string | null;
  requestedByType: ProviderLaneExecutionUserType;
  resultText: string | null;
  route: ProviderLaneResolvedRoute | null;
  serviceTier: string | null;
  status: LongContextAnalysisJobStatus;
  systemPrompt: string | null;
  updatedAt: Date;
  useCase: LongContextAnalysisUseCase;
}

export interface RunLongContextAnalysisInput {
  cacheTtl?: LongContextCacheTtl | null;
  draftId?: string | null;
  maxOutputTokens?: number | null;
  metadata?: Record<string, unknown>;
  preferredProviders?: string[] | null;
  prompt: string;
  requestedById?: string | null;
  requestedByType?: ProviderLaneExecutionUserType | null;
  serviceTier?: LongContextServiceTier | null;
  systemPrompt?: string | null;
  useCase: LongContextAnalysisUseCase;
}

export interface LongContextService {
  getJob(jobId: string): Promise<LongContextAnalysisJob | null>;
  runAnalysis(input: RunLongContextAnalysisInput): Promise<LongContextAnalysisJob>;
}
