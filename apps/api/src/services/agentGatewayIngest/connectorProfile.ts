import type { AgentGatewayAdapterName } from '../agentGatewayAdapter/types';

export interface AgentGatewayIngestConnectorProfile {
  connectorId: string;
  adapter: AgentGatewayAdapterName | null;
  channel: string | null;
  fromRole: string | null;
  toRole: string | null;
  type: string | null;
}

type ConnectorProfileMap = Map<string, AgentGatewayIngestConnectorProfile>;

const ADAPTER_NAMES: readonly AgentGatewayAdapterName[] = [
  'web',
  'live_session',
  'external_webhook',
];
const ADAPTER_NAME_SET = new Set<string>(ADAPTER_NAMES);

const normalize = (value: string) => value.trim();
const normalizeLower = (value: string) => normalize(value).toLowerCase();

const parseOptionalLowerString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = normalizeLower(value);
  return normalized.length > 0 ? normalized : null;
};

const parseOptionalAdapter = (
  value: unknown,
): AgentGatewayAdapterName | null => {
  const normalized = parseOptionalLowerString(value);
  if (!normalized) {
    return null;
  }
  if (!ADAPTER_NAME_SET.has(normalized)) {
    return null;
  }
  return normalized as AgentGatewayAdapterName;
};

export const parseConnectorProfileMap = (
  rawConfig: string,
): ConnectorProfileMap => {
  const trimmed = normalize(rawConfig);
  if (!trimmed) {
    return new Map();
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid AGENT_GATEWAY_INGEST_CONNECTOR_PROFILES JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Invalid AGENT_GATEWAY_INGEST_CONNECTOR_PROFILES JSON: expected object.',
    );
  }

  const result: ConnectorProfileMap = new Map();
  const record = parsed as Record<string, unknown>;
  for (const [connectorRaw, profileRaw] of Object.entries(record)) {
    const connectorId = normalizeLower(connectorRaw);
    if (!connectorId) {
      continue;
    }
    const failPrefix = 'Invalid AGENT_GATEWAY_INGEST_CONNECTOR_PROFILES JSON';

    if (typeof profileRaw === 'string') {
      result.set(connectorId, {
        connectorId,
        adapter: null,
        channel: parseOptionalLowerString(profileRaw),
        fromRole: null,
        toRole: null,
        type: null,
      });
      continue;
    }

    if (
      !profileRaw ||
      typeof profileRaw !== 'object' ||
      Array.isArray(profileRaw)
    ) {
      throw new Error(
        `${failPrefix}: connector "${connectorId}" must map to object or channel string.`,
      );
    }

    const profileRecord = profileRaw as Record<string, unknown>;
    const adapter = parseOptionalAdapter(profileRecord.adapter);
    if (profileRecord.adapter !== undefined && !adapter) {
      throw new Error(
        `${failPrefix}: connector "${connectorId}" has unsupported adapter.`,
      );
    }

    const profile = {
      connectorId,
      adapter,
      channel: parseOptionalLowerString(profileRecord.channel),
      fromRole: parseOptionalLowerString(profileRecord.fromRole),
      toRole: parseOptionalLowerString(profileRecord.toRole),
      type: parseOptionalLowerString(profileRecord.type),
    };

    if (
      !(
        profile.adapter ||
        profile.channel ||
        profile.fromRole ||
        profile.toRole ||
        profile.type
      )
    ) {
      throw new Error(
        `${failPrefix}: connector "${connectorId}" profile cannot be empty.`,
      );
    }

    result.set(connectorId, profile);
  }
  return result;
};

export const resolveConnectorProfile = (
  profiles: ConnectorProfileMap,
  connectorId: string,
): AgentGatewayIngestConnectorProfile => {
  const normalizedConnectorId = normalizeLower(connectorId);
  const profile = profiles.get(normalizedConnectorId);
  if (profile) {
    return profile;
  }
  return {
    connectorId: normalizedConnectorId,
    adapter: null,
    channel: null,
    fromRole: null,
    toRole: null,
    type: null,
  };
};
