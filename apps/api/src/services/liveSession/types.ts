import type { DbClient } from '../auth/types';

export type LiveStudioSessionStatus =
  | 'forming'
  | 'live'
  | 'completed'
  | 'cancelled';
export type LiveSessionParticipantType = 'human' | 'agent';
export type LiveSessionPresenceStatus = 'watching' | 'active' | 'left';

export interface LiveStudioSession {
  id: string;
  hostAgentId: string;
  draftId: string | null;
  title: string;
  objective: string;
  status: LiveStudioSessionStatus;
  isPublic: boolean;
  recapSummary: string | null;
  recapClipUrl: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participantCount: number;
  messageCount: number;
  lastActivityAt: Date;
}

export interface LiveSessionPresence {
  id: string;
  sessionId: string;
  participantType: LiveSessionParticipantType;
  participantId: string;
  status: LiveSessionPresenceStatus;
  joinedAt: Date;
  lastSeenAt: Date;
}

export interface LiveSessionMessage {
  id: string;
  sessionId: string;
  authorType: LiveSessionParticipantType;
  authorId: string;
  authorLabel: string;
  content: string;
  createdAt: Date;
}

export interface LiveSessionDetail {
  session: LiveStudioSession;
  presence: LiveSessionPresence[];
  messages: LiveSessionMessage[];
}

export interface CreateLiveSessionInput {
  draftId?: string;
  title: string;
  objective: string;
  isPublic?: boolean;
}

export interface CompleteLiveSessionInput {
  recapSummary?: string;
  recapClipUrl?: string;
}

export interface UpsertLivePresenceInput {
  participantType: LiveSessionParticipantType;
  participantId: string;
  status: LiveSessionPresenceStatus;
}

export interface AddLiveMessageInput {
  authorType: LiveSessionParticipantType;
  authorId: string;
  authorLabel: string;
  content: string;
}

export interface LiveSessionListFilters {
  status?: LiveStudioSessionStatus;
  limit?: number;
  offset?: number;
}

export interface LiveSessionService {
  listSessions(
    filters?: LiveSessionListFilters,
    client?: DbClient,
  ): Promise<LiveStudioSession[]>;
  getSession(
    sessionId: string,
    client?: DbClient,
  ): Promise<LiveSessionDetail | null>;
  createSession(
    hostAgentId: string,
    input: CreateLiveSessionInput,
    client?: DbClient,
  ): Promise<LiveSessionDetail>;
  startSession(
    sessionId: string,
    hostAgentId: string,
    client?: DbClient,
  ): Promise<LiveSessionDetail>;
  completeSession(
    sessionId: string,
    hostAgentId: string,
    input: CompleteLiveSessionInput,
    client?: DbClient,
  ): Promise<LiveSessionDetail>;
  upsertPresence(
    sessionId: string,
    input: UpsertLivePresenceInput,
    client?: DbClient,
  ): Promise<LiveSessionPresence>;
  addMessage(
    sessionId: string,
    input: AddLiveMessageInput,
    client?: DbClient,
  ): Promise<LiveSessionMessage>;
}
