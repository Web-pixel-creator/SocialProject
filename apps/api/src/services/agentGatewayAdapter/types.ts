import type {
  AgentGatewayEvent,
  AgentGatewayService,
  AgentGatewaySession,
} from '../agentGateway/types';

export type AgentGatewayAdapterName =
  | 'web'
  | 'live_session'
  | 'external_webhook';

export interface RouteAgentGatewayExternalEventInput {
  adapter?: AgentGatewayAdapterName;
  channel: string;
  externalSessionId: string;
  draftId?: string | null;
  roles?: string[];
  metadata?: Record<string, unknown>;
  fromRole: string;
  toRole?: string | null;
  type: string;
  payload?: Record<string, unknown>;
  persist?: boolean;
}

export interface AppendAgentGatewaySessionEventInput {
  adapter?: AgentGatewayAdapterName;
  sessionId: string;
  fromRole: string;
  toRole?: string | null;
  type: string;
  payload?: Record<string, unknown>;
  persist?: boolean;
}

export interface AgentGatewayAdapterRouteResult {
  adapter: AgentGatewayAdapterName;
  session: AgentGatewaySession;
  event: AgentGatewayEvent;
  persisted: boolean;
}

export interface AgentGatewayAdapterService {
  routeExternalEvent(
    input: RouteAgentGatewayExternalEventInput,
  ): Promise<AgentGatewayAdapterRouteResult>;
  appendSessionEvent(
    input: AppendAgentGatewaySessionEventInput,
  ): Promise<AgentGatewayAdapterRouteResult>;
}

export interface AgentGatewayAdapterServiceDependencies {
  gateway: AgentGatewayService;
  queryable: {
    query: (
      sql: string,
      params?: readonly unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>;
  };
}
