import crypto from 'node:crypto';

export type IngestSecretSource = 'connector' | 'global';

export interface IngestSecretCandidate {
  keyId: string | null;
  secret: string;
  source: IngestSecretSource;
}

type ConnectorSecretMap = Map<string, IngestSecretCandidate[]>;

const normalize = (value: string) => value.trim();
const normalizeLower = (value: string) => normalize(value).toLowerCase();

const toBuffer = (value: string) => Buffer.from(value, 'utf8');

const timingSafeEqualHex = (leftHex: string, rightHex: string) => {
  const left = toBuffer(leftHex);
  const right = toBuffer(rightHex);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const normalizeSecret = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = normalize(value);
  return normalized.length > 0 ? normalized : null;
};

const buildGlobalCandidates = (
  globalSecrets: string[],
): IngestSecretCandidate[] =>
  globalSecrets.map((secret, index) => ({
    keyId: index === 0 ? 'global-primary' : `global-prev-${index}`,
    secret,
    source: 'global',
  }));

const dedupeCandidates = (
  candidates: IngestSecretCandidate[],
): IngestSecretCandidate[] => {
  const seen = new Set<string>();
  const deduped: IngestSecretCandidate[] = [];
  for (const candidate of candidates) {
    const dedupeKey = `${candidate.source}:${candidate.keyId ?? ''}:${candidate.secret}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    deduped.push(candidate);
  }
  return deduped;
};

export const parseGlobalSecretList = (
  primarySecret: string,
  previousSecretsRaw: string,
) => {
  const values = [
    normalizeSecret(primarySecret),
    ...previousSecretsRaw
      .split(',')
      .map((value) => normalizeSecret(value))
      .filter((value): value is string => Boolean(value)),
  ];
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
};

export const parseConnectorSecretMap = (
  rawConfig: string,
): ConnectorSecretMap => {
  const trimmed = normalize(rawConfig);
  if (!trimmed) {
    return new Map();
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid AGENT_GATEWAY_INGEST_CONNECTOR_SECRETS JSON: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Invalid AGENT_GATEWAY_INGEST_CONNECTOR_SECRETS JSON: expected object.',
    );
  }
  const sourceRecord = parsed as Record<string, unknown>;
  const result: ConnectorSecretMap = new Map();

  for (const [connectorRaw, connectorValue] of Object.entries(sourceRecord)) {
    const connectorId = normalizeLower(connectorRaw);
    if (!connectorId) {
      continue;
    }
    const candidates: IngestSecretCandidate[] = [];
    if (typeof connectorValue === 'string') {
      const secret = normalizeSecret(connectorValue);
      if (secret) {
        candidates.push({
          keyId: null,
          secret,
          source: 'connector',
        });
      }
    } else if (Array.isArray(connectorValue)) {
      for (const value of connectorValue) {
        const secret = normalizeSecret(value);
        if (!secret) {
          continue;
        }
        candidates.push({
          keyId: null,
          secret,
          source: 'connector',
        });
      }
    } else if (
      connectorValue &&
      typeof connectorValue === 'object' &&
      !Array.isArray(connectorValue)
    ) {
      const keyedRecord = connectorValue as Record<string, unknown>;
      for (const [keyIdRaw, secretRaw] of Object.entries(keyedRecord)) {
        const secret = normalizeSecret(secretRaw);
        if (!secret) {
          continue;
        }
        const keyId = normalize(keyIdRaw);
        candidates.push({
          keyId: keyId.length > 0 ? keyId : null,
          secret,
          source: 'connector',
        });
      }
    }
    if (candidates.length > 0) {
      result.set(connectorId, dedupeCandidates(candidates));
    }
  }

  return result;
};

export const resolveSignatureCandidates = (params: {
  connectorId: string;
  keyId: string | null;
  connectorSecrets: ConnectorSecretMap;
  globalSecrets: string[];
  requireConnectorSecret: boolean;
}): IngestSecretCandidate[] => {
  const connectorId = normalizeLower(params.connectorId);
  const keyId = params.keyId ? normalize(params.keyId) : null;
  const connectorCandidates = params.connectorSecrets.get(connectorId) ?? [];

  if (connectorCandidates.length > 0) {
    const scoped = keyId
      ? connectorCandidates.filter((candidate) => candidate.keyId === keyId)
      : connectorCandidates;
    return dedupeCandidates(scoped);
  }

  if (params.requireConnectorSecret) {
    return [];
  }

  const globalCandidates = buildGlobalCandidates(params.globalSecrets);
  const scoped = keyId
    ? globalCandidates.filter((candidate) => candidate.keyId === keyId)
    : globalCandidates;
  return dedupeCandidates(scoped);
};

export const verifySignatureWithCandidates = (params: {
  signatureHex: string;
  timestamp: number;
  bodyCanonicalJson: string;
  candidates: IngestSecretCandidate[];
}): IngestSecretCandidate | null => {
  const message = `${params.timestamp}.${params.bodyCanonicalJson}`;
  for (const candidate of params.candidates) {
    const expected = crypto
      .createHmac('sha256', candidate.secret)
      .update(message)
      .digest('hex');
    if (timingSafeEqualHex(expected, params.signatureHex)) {
      return candidate;
    }
  }
  return null;
};
