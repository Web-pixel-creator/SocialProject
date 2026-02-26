import crypto from 'node:crypto';
import {
  parseConnectorSecretMap,
  parseGlobalSecretList,
  resolveSignatureCandidates,
  verifySignatureWithCandidates,
} from '../services/agentGatewayIngest/signaturePolicy';

const stableStringify = (value: unknown): string => JSON.stringify(value);

describe('agent gateway ingest signature policy', () => {
  test('parses connector secret map and resolves connector-specific candidates', () => {
    const parsed = parseConnectorSecretMap(
      JSON.stringify({
        'partner-alpha': ['secret-a-v1', 'secret-a-v2'],
        'partner-beta': {
          'key-beta-1': 'beta-secret',
        },
      }),
    );

    const alpha = resolveSignatureCandidates({
      connectorId: 'partner-alpha',
      keyId: null,
      connectorSecrets: parsed,
      globalSecrets: ['global-secret'],
      requireConnectorSecret: false,
    });
    expect(alpha).toHaveLength(2);
    expect(alpha.every((candidate) => candidate.source === 'connector')).toBe(
      true,
    );

    const beta = resolveSignatureCandidates({
      connectorId: 'partner-beta',
      keyId: 'key-beta-1',
      connectorSecrets: parsed,
      globalSecrets: ['global-secret'],
      requireConnectorSecret: false,
    });
    expect(beta).toHaveLength(1);
    expect(beta[0]?.keyId).toBe('key-beta-1');
    expect(beta[0]?.secret).toBe('beta-secret');
  });

  test('falls back to global secrets and supports global secret rotation', () => {
    const globalSecrets = parseGlobalSecretList('global-primary', 'global-old');
    const candidates = resolveSignatureCandidates({
      connectorId: 'unknown-connector',
      keyId: null,
      connectorSecrets: new Map(),
      globalSecrets,
      requireConnectorSecret: false,
    });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.source).toBe('global');
    expect(candidates[0]?.keyId).toBe('global-primary');
    expect(candidates[1]?.keyId).toBe('global-prev-1');
  });

  test('returns empty candidates when connector secret is required but missing', () => {
    const candidates = resolveSignatureCandidates({
      connectorId: 'partner-missing',
      keyId: null,
      connectorSecrets: new Map(),
      globalSecrets: ['global-secret'],
      requireConnectorSecret: true,
    });
    expect(candidates).toHaveLength(0);
  });

  test('verifies signature against rotated connector secret candidates', () => {
    const payload = {
      channel: 'draft_cycle',
      eventId: 'evt-1',
    };
    const timestamp = Math.floor(Date.now() / 1000);
    const canonical = stableStringify(payload);
    const rotatedSecret = 'rotated-secret-v2';
    const signature = crypto
      .createHmac('sha256', rotatedSecret)
      .update(`${timestamp}.${canonical}`)
      .digest('hex');

    const matched = verifySignatureWithCandidates({
      signatureHex: signature,
      timestamp,
      bodyCanonicalJson: canonical,
      candidates: [
        { source: 'connector', keyId: 'old', secret: 'rotated-secret-v1' },
        { source: 'connector', keyId: 'new', secret: rotatedSecret },
      ],
    });

    expect(matched).not.toBeNull();
    expect(matched?.keyId).toBe('new');
  });
});
