export type AgentGatewayIngestConnectorRisk =
  | 'restricted'
  | 'standard'
  | 'trusted';

export interface AgentGatewayIngestConnectorPolicy {
  connectorId: string;
  riskLevel: AgentGatewayIngestConnectorRisk;
  rateLimitMax: number | null;
  requireConnectorSecret: boolean;
}

type ConnectorPolicyMap = Map<string, AgentGatewayIngestConnectorPolicy>;

const normalize = (value: string) => value.trim();
const normalizeLower = (value: string) => normalize(value).toLowerCase();

const normalizeRiskLevel = (
  value: unknown,
): AgentGatewayIngestConnectorRisk | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = normalizeLower(value);
  if (
    normalized === 'restricted' ||
    normalized === 'standard' ||
    normalized === 'trusted'
  ) {
    return normalized;
  }
  return null;
};

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value !== 'boolean') {
    return null;
  }
  return value;
};

export const parseConnectorPolicyMap = (
  rawConfig: string,
): ConnectorPolicyMap => {
  const trimmed = normalize(rawConfig);
  if (!trimmed) {
    return new Map();
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid AGENT_GATEWAY_INGEST_CONNECTOR_POLICIES JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Invalid AGENT_GATEWAY_INGEST_CONNECTOR_POLICIES JSON: expected object.',
    );
  }

  const result: ConnectorPolicyMap = new Map();
  const record = parsed as Record<string, unknown>;
  for (const [connectorRaw, policyRaw] of Object.entries(record)) {
    const connectorId = normalizeLower(connectorRaw);
    if (!connectorId) {
      continue;
    }

    const failPrefix = 'Invalid AGENT_GATEWAY_INGEST_CONNECTOR_POLICIES JSON';
    if (typeof policyRaw === 'string') {
      const riskLevel = normalizeRiskLevel(policyRaw);
      if (!riskLevel) {
        throw new Error(
          `${failPrefix}: connector "${connectorId}" has unsupported riskLevel.`,
        );
      }
      result.set(connectorId, {
        connectorId,
        riskLevel,
        rateLimitMax: null,
        requireConnectorSecret: false,
      });
      continue;
    }

    if (
      !policyRaw ||
      typeof policyRaw !== 'object' ||
      Array.isArray(policyRaw)
    ) {
      throw new Error(
        `${failPrefix}: connector "${connectorId}" must map to object or risk string.`,
      );
    }
    const policyRecord = policyRaw as Record<string, unknown>;
    const riskLevelRaw = policyRecord.riskLevel;
    const riskLevel = riskLevelRaw
      ? normalizeRiskLevel(riskLevelRaw)
      : 'standard';
    if (!riskLevel) {
      throw new Error(
        `${failPrefix}: connector "${connectorId}" has unsupported riskLevel.`,
      );
    }
    const rateLimitMaxRaw = policyRecord.rateLimitMax;
    const rateLimitMax =
      rateLimitMaxRaw === undefined ? null : parsePositiveInt(rateLimitMaxRaw);
    if (rateLimitMaxRaw !== undefined && rateLimitMax === null) {
      throw new Error(
        `${failPrefix}: connector "${connectorId}" has invalid rateLimitMax.`,
      );
    }
    const requireConnectorSecretRaw = policyRecord.requireConnectorSecret;
    const requireConnectorSecret =
      requireConnectorSecretRaw === undefined
        ? false
        : parseBoolean(requireConnectorSecretRaw);
    if (
      requireConnectorSecretRaw !== undefined &&
      requireConnectorSecret === null
    ) {
      throw new Error(
        `${failPrefix}: connector "${connectorId}" has invalid requireConnectorSecret.`,
      );
    }

    result.set(connectorId, {
      connectorId,
      riskLevel,
      rateLimitMax,
      requireConnectorSecret: requireConnectorSecret ?? false,
    });
  }

  return result;
};

export const resolveConnectorPolicy = (
  policies: ConnectorPolicyMap,
  connectorId: string,
): AgentGatewayIngestConnectorPolicy => {
  const normalizedConnectorId = normalizeLower(connectorId);
  const policy = policies.get(normalizedConnectorId);
  if (policy) {
    return policy;
  }
  return {
    connectorId: normalizedConnectorId,
    riskLevel: 'standard',
    rateLimitMax: null,
    requireConnectorSecret: false,
  };
};
