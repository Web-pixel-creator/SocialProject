export type AgentGatewaySessionStatus = 'active' | 'closed';

export interface AgentGatewaySession {
  id: string;
  channel: string;
  externalSessionId: string | null;
  draftId: string | null;
  roles: string[];
  metadata: Record<string, unknown>;
  status: AgentGatewaySessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGatewayEvent {
  id: string;
  sessionId: string;
  fromRole: string;
  toRole: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CreateAgentGatewaySessionInput {
  channel: string;
  externalSessionId?: string | null;
  draftId?: string | null;
  roles?: string[];
  metadata?: Record<string, unknown>;
}

export interface EnsureAgentGatewaySessionInput
  extends CreateAgentGatewaySessionInput {
  externalSessionId: string;
}

export interface AppendAgentGatewayEventInput {
  fromRole: string;
  toRole?: string | null;
  type: string;
  payload?: Record<string, unknown>;
}

export interface AgentGatewaySessionDetail {
  session: AgentGatewaySession;
  events: AgentGatewayEvent[];
}

export interface AgentGatewaySessionListFilters {
  channel?: string | null;
  provider?: string | null;
  status?: AgentGatewaySessionStatus | null;
}

export interface AgentGatewaySessionCompactResult {
  session: AgentGatewaySession;
  event: AgentGatewayEvent;
  keepRecent: number;
  totalBefore: number;
  totalAfter: number;
  keptCount: number;
  prunedCount: number;
  eventTypeCounts: Record<string, number>;
}

export interface AgentGatewayService {
  createSession(input: CreateAgentGatewaySessionInput): AgentGatewaySession;
  ensureExternalSession(
    input: EnsureAgentGatewaySessionInput,
  ): AgentGatewaySession;
  listSessions(
    limit?: number,
    filters?: AgentGatewaySessionListFilters,
  ): AgentGatewaySession[];
  listPersistedSessions(
    limit?: number,
    filters?: AgentGatewaySessionListFilters,
  ): Promise<AgentGatewaySession[]>;
  getSession(sessionId: string): AgentGatewaySessionDetail;
  getPersistedSession(
    sessionId: string,
  ): Promise<AgentGatewaySessionDetail | null>;
  appendEvent(
    sessionId: string,
    input: AppendAgentGatewayEventInput,
  ): AgentGatewayEvent;
  persistSession(session: AgentGatewaySession): Promise<void>;
  persistEvent(event: AgentGatewayEvent): Promise<void>;
  compactSession(
    sessionId: string,
    keepRecent?: number,
  ): Promise<AgentGatewaySessionCompactResult>;
  closeSession(sessionId: string): AgentGatewaySession;
}
