import {
  parseConnectorProfileMap,
  resolveConnectorProfile,
  resolveConnectorProfileDefaults,
} from '../services/agentGatewayIngest/connectorProfile';

describe('agent gateway ingest connector profile', () => {
  test('parses connector profiles with object and channel-string shorthand', () => {
    const profiles = parseConnectorProfileMap(
      JSON.stringify({
        'telegram-main': {
          adapter: 'external_webhook',
          channel: 'telegram',
          fromRole: 'observer',
          toRole: 'author',
          type: 'observer_message',
        },
        'slack-main': 'slack',
      }),
    );

    expect(resolveConnectorProfile(profiles, 'telegram-main')).toEqual({
      connectorId: 'telegram-main',
      adapter: 'external_webhook',
      channel: 'telegram',
      fromRole: 'observer',
      toRole: 'author',
      type: 'observer_message',
    });
    expect(resolveConnectorProfile(profiles, 'slack-main')).toEqual({
      connectorId: 'slack-main',
      adapter: null,
      channel: 'slack',
      fromRole: null,
      toRole: null,
      type: null,
    });
  });

  test('normalizes connector profile values to lowercase', () => {
    const profiles = parseConnectorProfileMap(
      JSON.stringify({
        TELEGRAM: {
          adapter: 'EXTERNAL_WEBHOOK',
          channel: 'Telegram',
          fromRole: 'OBSERVER',
          toRole: 'Author',
          type: 'Observer_Message',
        },
      }),
    );

    expect(resolveConnectorProfile(profiles, 'telegram')).toEqual({
      connectorId: 'telegram',
      adapter: 'external_webhook',
      channel: 'telegram',
      fromRole: 'observer',
      toRole: 'author',
      type: 'observer_message',
    });
  });

  test('falls back to null-profile when connector profile is missing', () => {
    const profile = resolveConnectorProfile(new Map(), 'partner-missing');
    expect(profile).toEqual({
      connectorId: 'partner-missing',
      adapter: null,
      channel: null,
      fromRole: null,
      toRole: null,
      type: null,
    });
  });

  test('resolves connector defaults from profile when body fields are missing', () => {
    const profile = resolveConnectorProfile(
      parseConnectorProfileMap(
        JSON.stringify({
          'telegram-main': {
            adapter: 'external_webhook',
            channel: 'telegram',
            fromRole: 'observer',
            toRole: 'author',
            type: 'observer_message',
          },
        }),
      ),
      'telegram-main',
    );

    const resolved = resolveConnectorProfileDefaults({
      profile,
      source: { connectorId: 'telegram-main', payload: {} },
    });

    expect(resolved).toEqual({
      adapter: 'external_webhook',
      channel: 'telegram',
      fromRole: 'observer',
      toRole: 'author',
      type: 'observer_message',
    });
  });

  test('prefers explicit body values over connector profile defaults', () => {
    const profile = resolveConnectorProfile(
      parseConnectorProfileMap(
        JSON.stringify({
          'telegram-main': {
            adapter: 'external_webhook',
            channel: 'telegram',
            fromRole: 'observer',
            toRole: 'author',
            type: 'observer_message',
          },
        }),
      ),
      'telegram-main',
    );

    const resolved = resolveConnectorProfileDefaults({
      profile,
      source: {
        adapter: 'external_webhook',
        channel: 'telegram_ops',
        fromRole: 'critic',
        toRole: 'maker',
        type: 'draft_cycle_critic_completed',
      },
    });

    expect(resolved).toEqual({
      adapter: 'external_webhook',
      channel: 'telegram_ops',
      fromRole: 'critic',
      toRole: 'maker',
      type: 'draft_cycle_critic_completed',
    });
  });

  test('throws on malformed or invalid connector profile payload', () => {
    expect(() => parseConnectorProfileMap('[')).toThrow(/connector_profiles/i);
    expect(() =>
      parseConnectorProfileMap(
        JSON.stringify({
          'partner-alpha': { adapter: 'unsupported' },
        }),
      ),
    ).toThrow(/unsupported adapter/i);
    expect(() =>
      parseConnectorProfileMap(
        JSON.stringify({
          'partner-alpha': {},
        }),
      ),
    ).toThrow(/cannot be empty/i);
  });
});
