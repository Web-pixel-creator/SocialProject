export type AdminUxPageSearchParams =
  | Record<string, string | string[] | undefined>
  | undefined;

export const GATEWAY_CHANNEL_QUERY_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
export const GATEWAY_PROVIDER_QUERY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const GATEWAY_SOURCE_QUERY_PATTERN = /^[a-z]+$/;
export const GATEWAY_SESSION_STATUS_QUERY_PATTERN = /^[a-z]+$/;
export const GATEWAY_EVENT_TYPE_QUERY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
export const GATEWAY_SOURCE_VALUES = new Set(['db', 'memory']);
export const GATEWAY_SESSION_STATUS_VALUES = new Set(['active', 'closed']);

export const parseOptionalFilteredQueryString = (
  value: unknown,
  {
    maxLength,
    pattern,
  }: {
    maxLength: number;
    pattern: RegExp;
  },
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return null;
  }
  return pattern.test(normalized) ? normalized : null;
};

const isTruthyQueryFlag = (value: unknown): boolean =>
  value === '1' || value === 'true' || value === 'yes';

const parseOptionalGatewayStatusScope = (value: unknown): string | null => {
  const parsed = parseOptionalFilteredQueryString(value, {
    maxLength: 16,
    pattern: GATEWAY_SESSION_STATUS_QUERY_PATTERN,
  });
  if (!(parsed && GATEWAY_SESSION_STATUS_VALUES.has(parsed))) {
    return null;
  }
  return parsed;
};

const parseOptionalGatewaySourceScope = (value: unknown): string | null => {
  const parsed = parseOptionalFilteredQueryString(value, {
    maxLength: 16,
    pattern: GATEWAY_SOURCE_QUERY_PATTERN,
  });
  if (!(parsed && GATEWAY_SOURCE_VALUES.has(parsed))) {
    return null;
  }
  return parsed;
};

export const resolveGatewayEventsRequestFilters = ({
  eventType,
  sessionFilters,
  queryProvider,
}: {
  eventType: string;
  sessionFilters: {
    provider: string | null;
  };
  queryProvider: string | null;
}): {
  eventType: string | null;
  provider: string | null;
} => ({
  eventType: eventType === 'all' ? null : eventType,
  provider: sessionFilters.provider ?? queryProvider,
});

export const resolveGatewayQueryState = (
  resolvedSearchParams: AdminUxPageSearchParams,
) => {
  const gatewayChannelFilter = parseOptionalFilteredQueryString(
    resolvedSearchParams?.gatewayChannel,
    {
      maxLength: 64,
      pattern: GATEWAY_CHANNEL_QUERY_PATTERN,
    },
  );
  const gatewayProviderFilter = parseOptionalFilteredQueryString(
    resolvedSearchParams?.gatewayProvider,
    {
      maxLength: 64,
      pattern: GATEWAY_PROVIDER_QUERY_PATTERN,
    },
  );
  const gatewaySourceFilter = parseOptionalGatewaySourceScope(
    resolvedSearchParams?.gatewaySource,
  );
  const gatewayStatusFilter = parseOptionalGatewayStatusScope(
    resolvedSearchParams?.gatewayStatus,
  );

  const rawSessionId = resolvedSearchParams?.session;
  const sessionIdFromQuery =
    typeof rawSessionId === 'string' && rawSessionId.trim().length > 0
      ? rawSessionId.trim()
      : null;
  const compactRequested = isTruthyQueryFlag(resolvedSearchParams?.compact);
  const closeRequested = isTruthyQueryFlag(resolvedSearchParams?.close);

  const rawKeepRecent = resolvedSearchParams?.keepRecent;
  const keepRecentFromQuery =
    typeof rawKeepRecent === 'string'
      ? Number.parseInt(rawKeepRecent, 10)
      : Number.NaN;
  const keepRecent =
    Number.isFinite(keepRecentFromQuery) && keepRecentFromQuery > 0
      ? Math.min(Math.max(keepRecentFromQuery, 5), 500)
      : undefined;

  const rawEventsLimit = resolvedSearchParams?.eventsLimit;
  const eventsLimitFromQuery =
    typeof rawEventsLimit === 'string'
      ? Number.parseInt(rawEventsLimit, 10)
      : Number.NaN;
  const eventsLimit =
    Number.isFinite(eventsLimitFromQuery) &&
    [8, 20, 50].includes(eventsLimitFromQuery)
      ? eventsLimitFromQuery
      : 8;

  const rawEventType = resolvedSearchParams?.eventType;
  const eventTypeFilter =
    parseOptionalFilteredQueryString(rawEventType, {
      maxLength: 120,
      pattern: GATEWAY_EVENT_TYPE_QUERY_PATTERN,
    }) ?? 'all';
  const rawEventQuery = resolvedSearchParams?.eventQuery;
  const eventQuery =
    typeof rawEventQuery === 'string' ? rawEventQuery.trim() : '';

  return {
    gatewayChannelFilter,
    gatewayProviderFilter,
    gatewaySourceFilter,
    gatewayStatusFilter,
    sessionIdFromQuery,
    compactRequested,
    closeRequested,
    keepRecent,
    eventsLimit,
    eventTypeFilter,
    eventQuery,
  };
};

export const resolveGatewaySessionMutations = async ({
  closeRequested,
  compactAgentGatewaySession,
  compactRequested,
  selectedSessionClosed,
  selectedSessionId,
  closeAgentGatewaySession,
  keepRecent,
}: {
  closeRequested: boolean;
  compactAgentGatewaySession: (
    sessionId: string,
    keepRecent?: number,
  ) => Promise<{
    message: string | null;
    error: string | null;
  }>;
  compactRequested: boolean;
  selectedSessionClosed: boolean;
  selectedSessionId: string | null;
  closeAgentGatewaySession: (sessionId: string) => Promise<{
    message: string | null;
    error: string | null;
  }>;
  keepRecent?: number;
}) => {
  let compactInfoMessage: string | null = null;
  let compactErrorMessage: string | null = null;
  let closeInfoMessage: string | null = null;
  let closeErrorMessage: string | null = null;

  if (closeRequested && selectedSessionId && selectedSessionClosed) {
    closeInfoMessage = 'Session already closed.';
  } else if (closeRequested && selectedSessionId) {
    const closeResult = await closeAgentGatewaySession(selectedSessionId);
    closeInfoMessage = closeResult.message;
    closeErrorMessage = closeResult.error;
  }

  if (compactRequested && selectedSessionId && selectedSessionClosed) {
    compactErrorMessage = 'Compaction is disabled for closed sessions.';
  } else if (compactRequested && selectedSessionId && !closeRequested) {
    const compactResult = await compactAgentGatewaySession(
      selectedSessionId,
      keepRecent,
    );
    compactInfoMessage = compactResult.message;
    compactErrorMessage = compactResult.error;
  }

  return {
    compactInfoMessage,
    compactErrorMessage,
    closeInfoMessage,
    closeErrorMessage,
  };
};
