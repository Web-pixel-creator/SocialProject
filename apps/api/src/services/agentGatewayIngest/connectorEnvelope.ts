export interface ResolveConnectorExternalSessionIdInput {
  explicitExternalSessionId: unknown;
  channel: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

const normalize = (value: string) => value.trim();
const normalizeLower = (value: string) => normalize(value).toLowerCase();

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getByPath = (source: unknown, path: readonly string[]): unknown => {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const firstPresent = (
  source: unknown,
  paths: ReadonlyArray<readonly string[]>,
): unknown => {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
};

const toSessionKeyPart = (value: unknown): string | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return String(Math.trunc(value));
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = normalize(value);
  if (!trimmed) {
    return null;
  }
  const sanitized = trimmed
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._:-]/g, '_');
  return sanitized || null;
};

const toPrefixedExternalSessionId = (
  prefix: string,
  rawValue: unknown,
): string | null => {
  const keyPart = toSessionKeyPart(rawValue);
  if (!keyPart) {
    return null;
  }
  const normalizedPrefix = normalizeLower(prefix);
  const candidate = `${normalizedPrefix}:${keyPart}`;
  return candidate.slice(0, 128);
};

const resolveTelegramExternalSessionId = (
  payload: Record<string, unknown>,
  metadata: Record<string, unknown>,
) =>
  toPrefixedExternalSessionId(
    'telegram_chat',
    firstPresent(payload, [
      ['message', 'chat', 'id'],
      ['edited_message', 'chat', 'id'],
      ['channel_post', 'chat', 'id'],
      ['callback_query', 'message', 'chat', 'id'],
      ['chat', 'id'],
    ]) ??
      firstPresent(metadata, [['telegramChatId'], ['chatId'], ['channelId']]),
  );

const resolveSlackExternalSessionId = (
  payload: Record<string, unknown>,
  metadata: Record<string, unknown>,
) =>
  toPrefixedExternalSessionId(
    'slack_channel',
    firstPresent(payload, [
      ['event', 'channel'],
      ['channel', 'id'],
      ['channel'],
    ]) ?? firstPresent(metadata, [['slackChannelId'], ['channelId']]),
  );

const resolveDiscordExternalSessionId = (
  payload: Record<string, unknown>,
  metadata: Record<string, unknown>,
) =>
  toPrefixedExternalSessionId(
    'discord_channel',
    firstPresent(payload, [['channel_id'], ['d', 'channel_id']]) ??
      firstPresent(metadata, [['discordChannelId'], ['channelId']]),
  );

export const resolveConnectorExternalSessionId = ({
  explicitExternalSessionId,
  channel,
  payload,
  metadata,
}: ResolveConnectorExternalSessionIdInput): unknown => {
  if (
    explicitExternalSessionId !== undefined &&
    explicitExternalSessionId !== null &&
    explicitExternalSessionId !== ''
  ) {
    return explicitExternalSessionId;
  }

  const normalizedChannel = normalizeLower(channel);
  const safePayload = toRecord(payload);
  const safeMetadata = toRecord(metadata);

  if (normalizedChannel === 'telegram') {
    return resolveTelegramExternalSessionId(safePayload, safeMetadata);
  }
  if (normalizedChannel === 'slack') {
    return resolveSlackExternalSessionId(safePayload, safeMetadata);
  }
  if (normalizedChannel === 'discord') {
    return resolveDiscordExternalSessionId(safePayload, safeMetadata);
  }
  return (
    safeMetadata.externalSessionId ??
    safePayload.externalSessionId ??
    safePayload.sessionId ??
    null
  );
};
