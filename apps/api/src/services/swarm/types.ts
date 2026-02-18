import type { DbClient } from '../auth/types';

export type SwarmStatus = 'forming' | 'active' | 'completed' | 'cancelled';
export type SwarmRole =
  | 'colorist'
  | 'compositor'
  | 'storyteller'
  | 'critic'
  | 'strategist';
export type SwarmJudgeEventType = 'checkpoint' | 'decision' | 'final';

export interface SwarmSession {
  id: string;
  hostAgentId: string;
  draftId: string | null;
  title: string;
  objective: string;
  status: SwarmStatus;
  judgeSummary: string | null;
  judgeScore: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  judgeEventCount: number;
  lastActivityAt: Date;
}

export interface SwarmMember {
  id: string;
  sessionId: string;
  agentId: string;
  role: SwarmRole;
  isLead: boolean;
  contributionSummary: string | null;
  createdAt: Date;
  studioName?: string | null;
  impact?: number;
  signal?: number;
  trustTier?: number;
}

export interface SwarmJudgeEvent {
  id: string;
  sessionId: string;
  eventType: SwarmJudgeEventType;
  score: number | null;
  notes: string;
  createdAt: Date;
}

export interface SwarmSessionDetail {
  session: SwarmSession;
  members: SwarmMember[];
  judgeEvents: SwarmJudgeEvent[];
}

export interface CreateSwarmMemberInput {
  agentId: string;
  role: SwarmRole;
  isLead?: boolean;
}

export interface CreateSwarmSessionInput {
  draftId?: string;
  title: string;
  objective: string;
  members: CreateSwarmMemberInput[];
}

export interface AddSwarmJudgeEventInput {
  eventType: SwarmJudgeEventType;
  score?: number;
  notes: string;
}

export interface CompleteSwarmSessionInput {
  judgeSummary: string;
  judgeScore?: number;
}

export interface SwarmListFilters {
  status?: SwarmStatus;
  limit?: number;
  offset?: number;
}

export interface SwarmService {
  createSession(
    hostAgentId: string,
    input: CreateSwarmSessionInput,
    client?: DbClient,
  ): Promise<SwarmSessionDetail>;
  listSessions(
    filters?: SwarmListFilters,
    client?: DbClient,
  ): Promise<SwarmSession[]>;
  getSession(id: string, client?: DbClient): Promise<SwarmSessionDetail | null>;
  startSession(
    sessionId: string,
    hostAgentId: string,
    client?: DbClient,
  ): Promise<SwarmSessionDetail>;
  addJudgeEvent(
    sessionId: string,
    hostAgentId: string,
    input: AddSwarmJudgeEventInput,
    client?: DbClient,
  ): Promise<SwarmJudgeEvent>;
  completeSession(
    sessionId: string,
    hostAgentId: string,
    input: CompleteSwarmSessionInput,
    client?: DbClient,
  ): Promise<SwarmSessionDetail>;
}
