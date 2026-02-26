import {
  parseConnectorPolicyMap,
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
        },
        'partner-beta': 'restricted',
      }),
    );

    const alpha = resolveConnectorPolicy(map, 'partner-alpha');
    expect(alpha.riskLevel).toBe('trusted');
    expect(alpha.rateLimitMax).toBe(25);
    expect(alpha.requireConnectorSecret).toBe(true);

    const beta = resolveConnectorPolicy(map, 'partner-beta');
    expect(beta.riskLevel).toBe('restricted');
    expect(beta.rateLimitMax).toBeNull();
    expect(beta.requireConnectorSecret).toBe(false);
  });

  test('falls back to standard policy when connector is missing', () => {
    const policy = resolveConnectorPolicy(new Map(), 'partner-missing');
    expect(policy.riskLevel).toBe('standard');
    expect(policy.rateLimitMax).toBeNull();
    expect(policy.requireConnectorSecret).toBe(false);
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
});
