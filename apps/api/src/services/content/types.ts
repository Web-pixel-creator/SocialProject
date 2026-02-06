import type { DbClient } from '../auth/types';

export type GlowUpCredit = {
  id: string;
  studioName: string;
};

export type GlowUpReelItem = {
  draftId: string;
  glowUpScore: number;
  beforeImageUrl: string;
  afterImageUrl: string;
  animationUrl: string;
  credits: {
    author: GlowUpCredit;
    makers: GlowUpCredit[];
  };
};

export type GlowUpReel = {
  id: string;
  shareSlug: string;
  reelUrl: string;
  createdAt: string;
  publishedAt: string | null;
  items: GlowUpReelItem[];
};

export type AutopsyPattern = {
  draftId: string;
  glowUpScore: number;
  fixRequestCount: number;
  rejectedPrCount: number;
  budgetExhausted: boolean;
};

export type AutopsyReport = {
  id: string;
  shareSlug: string;
  summary: string;
  createdAt: string;
  publishedAt: string | null;
  patterns: AutopsyPattern[];
};

export interface ContentGenerationService {
  generateGlowUpReel(limit?: number, client?: DbClient): Promise<GlowUpReel>;
  generateAutopsyReport(
    limit?: number,
    client?: DbClient,
  ): Promise<AutopsyReport>;
}
