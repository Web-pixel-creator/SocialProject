interface GatewayEventsRequestFilters {
  eventType: string | null;
  provider: string | null;
}

interface GatewaySessionFilters {
  channel: string | null;
  provider: string | null;
  status: string | null;
}

interface GatewaySessionLike {
  id?: unknown;
  status?: unknown;
}

export const resolveGatewaySessionOrchestrationState = async <
  TSession extends GatewaySessionLike,
  TGatewayOverview,
  TGatewayEvent,
>({
  closeRequested,
  compactRequested,
  eventQuery,
  eventTypeFilter,
  eventsLimit,
  fetchAgentGatewayOverview,
  fetchAgentGatewayRecentEvents,
  gatewayProviderFilter,
  gatewaySessionFilters,
  gatewaySessions,
  gatewaySessionsError,
  gatewaySessionsSource,
  keepRecent,
  resolveGatewayEventsRequestFilters,
  resolveGatewaySessionMutations,
  sessionIdFromQuery,
  toStringValue,
}: {
  closeRequested: boolean;
  compactRequested: boolean;
  eventQuery: string;
  eventTypeFilter: string;
  eventsLimit: number;
  fetchAgentGatewayOverview: (
    sessionId: string,
    source: string | null,
  ) => Promise<{
    data: TGatewayOverview | null;
    error: string | null;
  }>;
  fetchAgentGatewayRecentEvents: (
    sessionId: string,
    limit: number,
    args: {
      eventQuery: string | null;
      eventType: string | null;
      provider: string | null;
      source: string | null;
    },
  ) => Promise<{
    data: TGatewayEvent[] | null;
    error: string | null;
  }>;
  gatewayProviderFilter: string | null;
  gatewaySessionFilters: GatewaySessionFilters;
  gatewaySessions: TSession[];
  gatewaySessionsError: string | null;
  gatewaySessionsSource: string;
  keepRecent?: number;
  resolveGatewayEventsRequestFilters: (args: {
    eventType: string;
    queryProvider: string | null;
    sessionFilters: {
      provider: string | null;
    };
  }) => GatewayEventsRequestFilters;
  resolveGatewaySessionMutations: (args: {
    closeRequested: boolean;
    compactRequested: boolean;
    keepRecent?: number;
    selectedSessionClosed: boolean;
    selectedSessionId: string | null;
  }) => Promise<{
    closeErrorMessage: string | null;
    closeInfoMessage: string | null;
    compactErrorMessage: string | null;
    compactInfoMessage: string | null;
  }>;
  sessionIdFromQuery: string | null;
  toStringValue: (value: unknown, fallback?: string) => string;
}): Promise<{
  closeInfoMessage: string | null;
  compactInfoMessage: string | null;
  gatewayError: string | null;
  gatewayOverview: TGatewayOverview | null;
  gatewayRecentEvents: TGatewayEvent[] | null;
  keepRecentValue: number;
  selectedSession: TSession | null;
  selectedSessionClosed: boolean;
  selectedSessionId: string | null;
}> => {
  const selectedSession =
    (sessionIdFromQuery
      ? gatewaySessions.find(
          (session) =>
            typeof session.id === 'string' && session.id === sessionIdFromQuery,
        )
      : null) ??
    gatewaySessions[0] ??
    null;
  const selectedSessionId =
    selectedSession && typeof selectedSession.id === 'string'
      ? selectedSession.id
      : null;
  const selectedSessionStatus = toStringValue(selectedSession?.status, '')
    .toLowerCase()
    .trim();
  const selectedSessionClosed = selectedSessionStatus === 'closed';
  const keepRecentValue = keepRecent ?? 40;
  const gatewaySessionSource =
    gatewaySessionsSource === 'memory' ? 'memory' : 'db';
  const gatewayEventsRequestFilters = resolveGatewayEventsRequestFilters({
    eventType: eventTypeFilter,
    sessionFilters: gatewaySessionFilters,
    queryProvider: gatewayProviderFilter,
  });

  const {
    compactInfoMessage,
    compactErrorMessage,
    closeInfoMessage,
    closeErrorMessage,
  } = await resolveGatewaySessionMutations({
    closeRequested,
    compactRequested,
    selectedSessionClosed,
    selectedSessionId,
    keepRecent,
  });

  const { data: gatewayOverview, error: gatewayOverviewError } =
    selectedSessionId !== null
      ? await fetchAgentGatewayOverview(selectedSessionId, gatewaySessionSource)
      : { data: null, error: null };
  const { data: gatewayRecentEvents, error: gatewayEventsError } =
    selectedSessionId !== null
      ? await fetchAgentGatewayRecentEvents(selectedSessionId, eventsLimit, {
          source: gatewaySessionSource,
          eventType: gatewayEventsRequestFilters.eventType,
          eventQuery: eventQuery.length > 0 ? eventQuery : null,
          provider: gatewayEventsRequestFilters.provider,
        })
      : { data: null, error: null };
  const gatewayError =
    closeErrorMessage ??
    compactErrorMessage ??
    gatewaySessionsError ??
    gatewayEventsError ??
    gatewayOverviewError;

  return {
    closeInfoMessage,
    compactInfoMessage,
    gatewayError,
    gatewayOverview,
    gatewayRecentEvents,
    keepRecentValue,
    selectedSession,
    selectedSessionClosed,
    selectedSessionId,
  };
};
