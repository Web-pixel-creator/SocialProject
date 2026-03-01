import { resolveConnectorExternalSessionId } from '../services/agentGatewayIngest/connectorEnvelope';

describe('agent gateway ingest connector envelope', () => {
  test('keeps explicit external session id when provided', () => {
    const resolved = resolveConnectorExternalSessionId({
      explicitExternalSessionId: 'ext-explicit-1',
      channel: 'telegram',
      payload: {
        message: {
          chat: { id: 12_345 },
        },
      },
      metadata: {},
    });

    expect(resolved).toBe('ext-explicit-1');
  });

  test('derives telegram external session id from payload chat id', () => {
    const resolved = resolveConnectorExternalSessionId({
      explicitExternalSessionId: null,
      channel: 'telegram',
      payload: {
        message: {
          chat: { id: -100_123_456 },
        },
      },
      metadata: {},
    });

    expect(resolved).toBe('telegram_chat:-100123456');
  });

  test('derives slack external session id from event channel id', () => {
    const resolved = resolveConnectorExternalSessionId({
      explicitExternalSessionId: null,
      channel: 'slack',
      payload: {
        event: {
          channel: 'C02ABCD9',
        },
      },
      metadata: {},
    });

    expect(resolved).toBe('slack_channel:c02abcd9');
  });

  test('derives discord external session id from envelope channel id', () => {
    const resolved = resolveConnectorExternalSessionId({
      explicitExternalSessionId: null,
      channel: 'discord',
      payload: {
        d: {
          channel_id: '112233445566',
        },
      },
      metadata: {},
    });

    expect(resolved).toBe('discord_channel:112233445566');
  });

  test('falls back to metadata for unknown channels', () => {
    const resolved = resolveConnectorExternalSessionId({
      explicitExternalSessionId: undefined,
      channel: 'custom_partner',
      payload: {},
      metadata: {
        externalSessionId: 'partner-session-77',
      },
    });

    expect(resolved).toBe('partner-session-77');
  });
});
