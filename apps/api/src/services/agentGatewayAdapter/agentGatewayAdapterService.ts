import { db } from '../../db/pool';
import { agentGatewayService } from '../agentGateway/agentGatewayService';
import type { AgentGatewayService } from '../agentGateway/types';
import { ServiceError } from '../common/errors';
import type {
  AgentGatewayAdapterName,
  AgentGatewayAdapterRouteResult,
  AgentGatewayAdapterService,
  AgentGatewayAdapterServiceDependencies,
  AppendAgentGatewaySessionEventInput,
  RouteAgentGatewayExternalEventInput,
} from './types';

const ADAPTER_TELEMETRY_SOURCE = 'agent_gateway_adapter';
const ADAPTER_NAMES: readonly AgentGatewayAdapterName[] = [
  'web',
  'live_session',
  'external_webhook',
];

const toNormalized = (value: string) => value.trim().toLowerCase();

const isAdapterName = (value: string): value is AgentGatewayAdapterName =>
  ADAPTER_NAMES.includes(value as AgentGatewayAdapterName);

const toJsonString = (value: unknown, fallback: '{}' | '[]' = '{}') => {
  try {
    return JSON.stringify(value ?? (fallback === '[]' ? [] : {}));
  } catch {
    return fallback;
  }
};

const normalizeExternalSessionId = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    throw new ServiceError(
      'AGENT_GATEWAY_EXTERNAL_SESSION_REQUIRED',
      'externalSessionId is required.',
      400,
    );
  }
  return trimmed;
};

const normalizeSessionId = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length < 1) {
    throw new ServiceError(
      'AGENT_GATEWAY_SESSION_NOT_FOUND',
      'Agent gateway session not found.',
      404,
    );
  }
  return trimmed;
};

const normalizeChannel = (value: string) => {
  const normalized = toNormalized(value);
  if (normalized.length < 1) {
    throw new ServiceError(
      'AGENT_GATEWAY_CHANNEL_REQUIRED',
      'channel is required.',
      400,
    );
  }
  return normalized;
};

const normalizeRole = (value: string, fieldName: 'fromRole' | 'toRole') => {
  const normalized = toNormalized(value);
  if (normalized.length < 1) {
    throw new ServiceError(
      'AGENT_GATEWAY_EVENT_INVALID',
      `${fieldName} is required.`,
      400,
    );
  }
  return normalized;
};

const normalizeEventType = (value: string) => {
  const normalized = toNormalized(value);
  if (normalized.length < 1) {
    throw new ServiceError(
      'AGENT_GATEWAY_EVENT_INVALID',
      'event type is required.',
      400,
    );
  }
  return normalized;
};

const toPayloadRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};

const extractProviderFromPayload = (payload: Record<string, unknown>) => {
  const selectedProvider = payload.selectedProvider;
  if (
    typeof selectedProvider === 'string' &&
    selectedProvider.trim().length > 0
  ) {
    return selectedProvider.trim().toLowerCase();
  }
  const provider = payload.provider;
  if (typeof provider === 'string' && provider.trim().length > 0) {
    return provider.trim().toLowerCase();
  }
  return null;
};

export class AgentGatewayAdapterServiceImpl
  implements AgentGatewayAdapterService
{
  private readonly gateway: AgentGatewayService;
  private readonly queryable: AgentGatewayAdapterServiceDependencies['queryable'];

  constructor(
    dependencies: Partial<AgentGatewayAdapterServiceDependencies> = {},
  ) {
    this.gateway = dependencies.gateway ?? agentGatewayService;
    this.queryable = dependencies.queryable ?? db;
  }

  async routeExternalEvent(
    input: RouteAgentGatewayExternalEventInput,
  ): Promise<AgentGatewayAdapterRouteResult> {
    const channel = normalizeChannel(input.channel);
    const adapter = this.resolveAdapter(input.adapter, channel);
    const externalSessionId = normalizeExternalSessionId(
      input.externalSessionId,
    );
    const eventType = normalizeEventType(input.type);
    const fromRole = normalizeRole(input.fromRole, 'fromRole');
    const toRole =
      typeof input.toRole === 'string'
        ? normalizeRole(input.toRole, 'toRole')
        : null;
    const payload = this.buildAdapterPayload(adapter, channel, input.payload);
    const provider = extractProviderFromPayload(payload);
    const persist = input.persist === true;

    try {
      const session = this.gateway.ensureExternalSession({
        channel,
        externalSessionId,
        draftId: input.draftId,
        roles: input.roles,
        metadata: {
          ...(input.metadata ?? {}),
          adapter,
          adapterChannel: channel,
        },
      });

      const event = this.gateway.appendEvent(session.id, {
        fromRole,
        toRole,
        type: eventType,
        payload,
      });

      if (persist) {
        await this.gateway.persistSession(
          this.gateway.getSession(session.id).session,
        );
        await this.gateway.persistEvent(event);
      }

      await this.recordTelemetry('agent_gateway_adapter_route_success', {
        adapter,
        channel,
        sessionId: session.id,
        externalSessionId,
        eventType,
        fromRole,
        toRole,
        persisted: persist,
        selectedProvider: provider,
      });

      return {
        adapter,
        session,
        event,
        persisted: persist,
      };
    } catch (error) {
      await this.recordTelemetry('agent_gateway_adapter_route_failed', {
        adapter,
        channel,
        externalSessionId,
        eventType,
        fromRole,
        toRole,
        persisted: persist,
        selectedProvider: provider,
        errorCode: error instanceof ServiceError ? error.code : 'UNKNOWN',
        errorMessage: error instanceof Error ? error.message : 'unknown error',
      });
      throw error;
    }
  }

  async appendSessionEvent(
    input: AppendAgentGatewaySessionEventInput,
  ): Promise<AgentGatewayAdapterRouteResult> {
    const sessionId = normalizeSessionId(input.sessionId);
    const detail = this.gateway.getSession(sessionId);
    const channel = normalizeChannel(detail.session.channel);
    const adapter = this.resolveAdapter(input.adapter, channel);
    const eventType = normalizeEventType(input.type);
    const fromRole = normalizeRole(input.fromRole, 'fromRole');
    const toRole =
      typeof input.toRole === 'string'
        ? normalizeRole(input.toRole, 'toRole')
        : null;
    const payload = this.buildAdapterPayload(adapter, channel, input.payload);
    const provider = extractProviderFromPayload(payload);
    const persist = input.persist === true;

    try {
      const event = this.gateway.appendEvent(sessionId, {
        fromRole,
        toRole,
        type: eventType,
        payload,
      });

      if (persist) {
        await this.gateway.persistSession(
          this.gateway.getSession(sessionId).session,
        );
        await this.gateway.persistEvent(event);
      }

      await this.recordTelemetry('agent_gateway_adapter_route_success', {
        adapter,
        channel,
        sessionId,
        externalSessionId: detail.session.externalSessionId,
        eventType,
        fromRole,
        toRole,
        persisted: persist,
        selectedProvider: provider,
      });

      return {
        adapter,
        session: this.gateway.getSession(sessionId).session,
        event,
        persisted: persist,
      };
    } catch (error) {
      await this.recordTelemetry('agent_gateway_adapter_route_failed', {
        adapter,
        channel,
        sessionId,
        externalSessionId: detail.session.externalSessionId,
        eventType,
        fromRole,
        toRole,
        persisted: persist,
        selectedProvider: provider,
        errorCode: error instanceof ServiceError ? error.code : 'UNKNOWN',
        errorMessage: error instanceof Error ? error.message : 'unknown error',
      });
      throw error;
    }
  }

  private resolveAdapter(
    adapter: AgentGatewayAdapterName | undefined,
    channel: string,
  ): AgentGatewayAdapterName {
    if (typeof adapter === 'string' && isAdapterName(adapter)) {
      return adapter;
    }
    if (channel === 'live_session') {
      return 'live_session';
    }
    if (
      channel === 'draft_cycle' ||
      channel === 'ws-control-plane' ||
      channel === 'web'
    ) {
      return 'web';
    }
    return 'external_webhook';
  }

  private buildAdapterPayload(
    adapter: AgentGatewayAdapterName,
    channel: string,
    payload: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const base = toPayloadRecord(payload);
    const gatewayAdapter = toPayloadRecord(base.gatewayAdapter);
    return {
      ...base,
      gatewayAdapter: {
        ...gatewayAdapter,
        name: adapter,
        channel,
      },
    };
  }

  private async recordTelemetry(
    eventType:
      | 'agent_gateway_adapter_route_success'
      | 'agent_gateway_adapter_route_failed',
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.queryable.query(
        `INSERT INTO ux_events (event_type, user_type, status, source, metadata)
         VALUES ($1, 'system', $2, $3, $4)`,
        [
          eventType,
          eventType === 'agent_gateway_adapter_route_success' ? 'ok' : 'failed',
          ADAPTER_TELEMETRY_SOURCE,
          toJsonString(metadata, '{}'),
        ],
      );
    } catch (error) {
      console.error('agent gateway adapter telemetry write failed', error);
    }
  }
}

export const agentGatewayAdapterService = new AgentGatewayAdapterServiceImpl();
