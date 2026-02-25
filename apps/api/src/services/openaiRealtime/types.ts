export type RealtimeOutputModality = 'text' | 'audio';

export type RealtimeVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'sage'
  | 'shimmer'
  | 'verse'
  | 'marin'
  | 'cedar';

export interface CreateOpenAIRealtimeSessionInput {
  liveSessionId: string;
  draftId?: string | null;
  liveTitle: string;
  liveObjective: string;
  observerId: string;
  outputModalities: RealtimeOutputModality[];
  voice: RealtimeVoice;
  pushToTalk: boolean;
  topicHint?: string;
  metadata?: Record<string, string>;
}

export interface OpenAIRealtimeSessionBootstrap {
  provider: 'openai';
  sessionId: string;
  clientSecret: string;
  clientSecretExpiresAt: string | null;
  expiresAt: string | null;
  model: string;
  outputModalities: RealtimeOutputModality[];
  voice: RealtimeVoice;
  transportHints: {
    recommended: 'webrtc';
    websocketSupported: true;
    pushToTalk: boolean;
  };
}

export interface OpenAIRealtimeSessionService {
  createSession(
    input: CreateOpenAIRealtimeSessionInput,
  ): Promise<OpenAIRealtimeSessionBootstrap>;
}
