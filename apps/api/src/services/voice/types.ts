import type { ProviderLaneExecutionUserType } from '../providerRouting/types';

export const VOICE_RENDER_SCOPES = ['admin_preview', 'live_session_recap'] as const;
export type VoiceRenderScope = (typeof VOICE_RENDER_SCOPES)[number];

export interface VoiceRenderArtifact {
  id: string;
  artifactUrl: string;
  contentType: string;
  createdAt: Date;
  createdById: string | null;
  createdByType: ProviderLaneExecutionUserType;
  draftId: string | null;
  durationMs: number | null;
  lane: 'voice_render';
  liveSessionId: string | null;
  metadata: Record<string, unknown>;
  model: string;
  provider: string;
  scope: VoiceRenderScope;
  script: string;
  storageKey: string;
  transcript: string;
  voice: string;
}

export interface CreateVoiceRenderArtifactInput {
  createdById?: string | null;
  createdByType?: ProviderLaneExecutionUserType | null;
  draftId?: string | null;
  liveSessionId?: string | null;
  metadata?: Record<string, unknown>;
  preferredProviders?: string[] | null;
  scope: VoiceRenderScope;
  script: string;
  transcript?: string | null;
  voice?: string | null;
}

export interface VoiceLaneService {
  renderArtifact(input: CreateVoiceRenderArtifactInput): Promise<VoiceRenderArtifact>;
}
