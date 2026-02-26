import {
  parseConnectorPolicyMap,
  resolveConnectorIngestBudgetLimits,
  resolveConnectorPolicy,
} from '../services/agentGatewayIngest/connectorPolicy';

describe('agent gateway ingest connector policy', () => {
  test('parses per-connector policy objects and risk string shorthand', () => {
    const map = parseConnectorPolicyMap(
      JSON.stringify({
        'partner-alpha': {
          riskLevel: 'trusted',
          rateLimitMax: 25,
          requireConnectorSecret: true,
          maxPayloadKeys: 16,
          maxMetadataKeys: 8,
          maxPayloadBytes: 4096,
        },
        'partner-beta': 'restricted',
      }),
    );

    const alpha = resolveConnectorPolicy(map, 'partner-alpha');
    expect(alpha.riskLevel).toBe('trusted');
    expect(alpha.rateLimitMax).toBe(25);
    expect(alpha.requireConnectorSecret).toBe(true);
    expect(alpha.maxPayloadKeys).toBe(16);
    expect(alpha.maxMetadataKeys).toBe(8);
    expect(alpha.maxPayloadBytes).toBe(4096);

    const beta = resolveConnectorPolicy(map, 'partner-beta');
    expect(beta.riskLevel).toBe('restricted');
    expect(beta.rateLimitMax).toBeNull();
    expect(beta.requireConnectorSecret).toBe(false);
    expect(beta.maxPayloadKeys).toBeNull();
    expect(beta.maxMetadataKeys).toBeNull();
    expect(beta.maxPayloadBytes).toBeNull();
  });

  test('falls back to standard policy when connector is missing', () => {
    const policy = resolveConnectorPolicy(new Map(), 'partner-missing');
    expect(policy.riskLevel).toBe('standard');
    expect(policy.rateLimitMax).toBeNull();
    expect(policy.requireConnectorSecret).toBe(false);
    expect(policy.maxPayloadKeys).toBeNull();
    expect(policy.maxMetadataKeys).toBeNull();
    expect(policy.maxPayloadBytes).toBeNull();
  });

  test('throws on malformed connector policy payload', () => {
    expect(() =>
      parseConnectorPolicyMap(
        JSON.stringify({
          'partner-alpha': { rateLimitMax: 0 },
        }),
      ),
    ).toThrow(/rateLimitMax/i);
  });

  test('resolves bounded payload budgets from connector policy', () => {
    const policy = resolveConnectorPolicy(
      parseConnectorPolicyMap(
        JSON.stringify({
          'partner-alpha': {
            maxPayloadKeys: 6,
            maxMetadataKeys: 4,
            maxPayloadBytes: 1024,
          },
        }),
      ),
      'partner-alpha',
    );

    const limits = resolveConnectorIngestBudgetLimits(policy, {
      maxPayloadKeys: 48,
      maxMetadataKeys: 48,
      maxPayloadBytes: 16_384,
    });

    expect(limits).toEqual({
      maxPayloadKeys: 6,
      maxMetadataKeys: 4,
      maxPayloadBytes: 1024,
    });
  });

  test('clamps connector payload budgets to default safety ceiling', () => {
    const policy = resolveConnectorPolicy(
      parseConnectorPolicyMap(
        JSON.stringify({
          'partner-alpha': {
            maxPayloadKeys: 500,
            maxMetadataKeys: 700,
            maxPayloadBytes: 999_999,
          },
        }),
      ),
      'partner-alpha',
    );

    const limits = resolveConnectorIngestBudgetLimits(policy, {
      maxPayloadKeys: 48,
      maxMetadataKeys: 48,
      maxPayloadBytes: 16_384,
    });

    expect(limits).toEqual({
      maxPayloadKeys: 48,
      maxMetadataKeys: 48,
      maxPayloadBytes: 16_384,
    });
  });
});
