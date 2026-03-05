import type { ReactNode } from 'react';

interface GatewaySessionOption {
  draftId?: unknown;
  draft_id?: unknown;
  id?: unknown;
  status?: unknown;
}

interface GatewayOverview {
  source: string;
  session: {
    channel: string;
    draftId: string;
    id: string;
    status: string;
  };
  summary: {
    compaction: {
      compactCount: number;
      prunedCountTotal: number;
    };
    lastEventType: string | null;
    totals: {
      durationMs: number | null;
      eventCount: number;
      failedStepCount: number;
    };
  };
}

interface GatewayRecentEventView {
  createdAt: string;
  fromRole: string;
  id: string;
  toRole: string;
  type: string;
}

const toStringValue = (value: unknown, fallback = 'n/a'): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

const StatCard = ({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: string;
}) => (
  <article className="card grid gap-1 p-4">
    <p className="text-muted-foreground text-xs uppercase tracking-wide">
      {label}
    </p>
    <p className="font-semibold text-foreground text-xl sm:text-2xl">{value}</p>
    {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
  </article>
);

export const GatewaySectionBody = ({
  activePanel,
  allMetricsView = 'overview',
  appliedGatewaySessionChannelFilter,
  appliedGatewaySessionProviderFilter,
  appliedGatewaySessionStatusInputValue,
  buildEventsCsv,
  closeInfoMessage,
  compactInfoMessage,
  eventQuery,
  eventsLimit,
  eventTypeFilter,
  expandAllGroups = false,
  gatewayError,
  gatewayOverview,
  gatewayRecentEvents,
  gatewaySessionScopeLabel,
  gatewaySessions,
  gatewaySessionsSource,
  gatewaySourceFilter,
  hours,
  keepRecentValue,
  selectedSession,
  selectedSessionClosed,
  selectedSessionId,
  toDurationText,
  topGatewayProvider,
}: {
  activePanel: string;
  allMetricsView?: string;
  appliedGatewaySessionChannelFilter: string | null;
  appliedGatewaySessionProviderFilter: string | null;
  appliedGatewaySessionStatusInputValue: string;
  buildEventsCsv: (events: GatewayRecentEventView[]) => string;
  closeInfoMessage: string | null;
  compactInfoMessage: string | null;
  eventQuery: string;
  eventsLimit: number;
  eventTypeFilter: string;
  expandAllGroups?: boolean;
  gatewayError: string | null;
  gatewayOverview: GatewayOverview | null;
  gatewayRecentEvents: GatewayRecentEventView[] | null;
  gatewaySessionScopeLabel: string;
  gatewaySessions: GatewaySessionOption[];
  gatewaySessionsSource: string;
  gatewaySourceFilter: string | null;
  hours: number;
  keepRecentValue: number;
  selectedSession: GatewaySessionOption | null;
  selectedSessionClosed: boolean;
  selectedSessionId: string | null;
  toDurationText: (value: number | null) => string;
  topGatewayProvider: [string, number] | null;
}) => {
  if (gatewaySessions.length > 0 && selectedSessionId === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Agent gateway sessions are available, but no valid session id could be
        resolved.
      </p>
    );
  }
  if (gatewayError) {
    return <p className="text-muted-foreground text-sm">{gatewayError}</p>;
  }
  if (gatewayOverview === null) {
    return (
      <p className="text-muted-foreground text-sm">
        No agent gateway sessions yet.
      </p>
    );
  }

  const currentSessionStatus = toStringValue(selectedSession?.status, 'n/a');
  const shouldPersistExpandedGroups = activePanel === 'all' && expandAllGroups;
  const currentDraftId = toStringValue(
    selectedSession?.draftId ?? selectedSession?.draft_id,
    'n/a',
  );
  const recentEvents = gatewayRecentEvents ?? [];
  const eventTypeOptions = [...new Set(recentEvents.map((event) => event.type))]
    .filter((type) => type.length > 0 && type !== 'n/a')
    .sort((left, right) => left.localeCompare(right));
  const normalizedEventQuery = eventQuery.toLowerCase();
  const filteredEvents = recentEvents.filter((event) => {
    const typeMatched =
      eventTypeFilter === 'all' || event.type === eventTypeFilter;
    if (!typeMatched) {
      return false;
    }
    if (normalizedEventQuery.length === 0) {
      return true;
    }
    return (
      event.type.toLowerCase().includes(normalizedEventQuery) ||
      event.fromRole.toLowerCase().includes(normalizedEventQuery) ||
      event.toRole.toLowerCase().includes(normalizedEventQuery)
    );
  });
  const jsonExportPayload = JSON.stringify(
    {
      sessionId: selectedSessionId,
      draftId: currentDraftId,
      eventTypeFilter,
      eventQuery,
      events: filteredEvents,
    },
    null,
    2,
  );
  const jsonExportHref = `data:application/json;charset=utf-8,${encodeURIComponent(jsonExportPayload)}`;
  const csvExportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    buildEventsCsv(filteredEvents),
  )}`;
  let recentEventsContent: ReactNode = null;
  if (recentEvents.length === 0) {
    recentEventsContent = (
      <p className="text-muted-foreground text-xs">
        No retained events for this session.
      </p>
    );
  } else if (filteredEvents.length === 0) {
    recentEventsContent = (
      <p className="text-muted-foreground text-xs">
        No events match current filters.
      </p>
    );
  } else {
    recentEventsContent = (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-3">Type</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2 text-right">At</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((event) => (
              <tr
                className="border-border/25 border-b last:border-b-0"
                key={event.id}
              >
                <td className="py-2 pr-3 text-foreground">{event.type}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {event.fromRole}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {event.toRole}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {event.createdAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {selectedSessionId ? (
        <>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input name="hours" type="hidden" value={`${hours}`} />
            <input name="panel" type="hidden" value={activePanel} />
            {activePanel === 'all' && allMetricsView !== 'overview' ? (
              <input name="allView" type="hidden" value={allMetricsView} />
            ) : null}
            {shouldPersistExpandedGroups ? (
              <input name="expand" type="hidden" value="all" />
            ) : null}
            <input
              name="gatewaySource"
              type="hidden"
              value={gatewaySourceFilter ?? ''}
            />
            {appliedGatewaySessionChannelFilter ? (
              <input
                name="gatewayChannel"
                type="hidden"
                value={appliedGatewaySessionChannelFilter}
              />
            ) : null}
            {appliedGatewaySessionProviderFilter ? (
              <input
                name="gatewayProvider"
                type="hidden"
                value={appliedGatewaySessionProviderFilter}
              />
            ) : null}
            <input
              name="gatewayStatus"
              type="hidden"
              value={appliedGatewaySessionStatusInputValue}
            />
            <label
              className="text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-session-select"
            >
              Session
            </label>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
              defaultValue={selectedSessionId}
              id="gateway-session-select"
              name="session"
            >
              {gatewaySessions.map((session, index) => {
                const id =
                  typeof session.id === 'string' && session.id.trim().length > 0
                    ? session.id
                    : `unknown-${index + 1}`;
                const draftId = toStringValue(
                  session.draftId ?? session.draft_id,
                  'n/a',
                );
                const status = toStringValue(session.status, 'n/a');
                return (
                  <option key={id} value={id}>
                    {id} | {status} | {draftId}
                  </option>
                );
              })}
            </select>
            <label
              className="text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-keep-recent-input"
            >
              Keep recent
            </label>
            <input
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
              defaultValue={`${keepRecentValue}`}
              id="gateway-keep-recent-input"
              max={500}
              min={5}
              name="keepRecent"
              type="number"
            />
            <label
              className="text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-events-limit-select"
            >
              Events limit
            </label>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
              defaultValue={`${eventsLimit}`}
              id="gateway-events-limit-select"
              name="eventsLimit"
            >
              <option value="8">8</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
            <label
              className="text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-event-type-filter"
            >
              Event type
            </label>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
              defaultValue={eventTypeFilter}
              id="gateway-event-type-filter"
              name="eventType"
            >
              <option value="all">all</option>
              {eventTypeOptions.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventType}
                </option>
              ))}
            </select>
            <label
              className="text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-event-query-input"
            >
              Search events
            </label>
            <input
              className="w-48 rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
              defaultValue={eventQuery}
              id="gateway-event-query-input"
              name="eventQuery"
              placeholder="type / role"
              type="text"
            />
            <button
              className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-sm hover:bg-accent"
              type="submit"
            >
              Open
            </button>
            <button
              className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-sm hover:bg-accent"
              disabled={selectedSessionClosed}
              name="compact"
              type="submit"
              value="1"
            >
              Compact now
            </button>
            <button
              className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-sm hover:bg-accent"
              disabled={selectedSessionClosed}
              name="close"
              type="submit"
              value="1"
            >
              Close session
            </button>
          </form>
          <details className="rounded-lg border border-border/30 bg-background/45 px-3 py-2">
            <summary className="cursor-pointer text-muted-foreground text-xs uppercase tracking-wide">
              Session details
            </summary>
            <p className="mt-2 text-muted-foreground text-xs">
              Source: {gatewaySessionsSource} | Selected: {selectedSessionId} |
              Status: {currentSessionStatus} | Draft: {currentDraftId}
              {` | Scope: ${gatewaySessionScopeLabel}`}
            </p>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              Session id
            </span>
            <input
              className="w-64 rounded-md border border-border bg-background px-2 py-1 text-foreground text-xs"
              readOnly
              value={selectedSessionId}
            />
            {currentDraftId !== 'n/a' ? (
              <a
                className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-xs hover:bg-accent"
                href={`/drafts/${encodeURIComponent(currentDraftId)}`}
              >
                Open draft
              </a>
            ) : null}
          </div>
          {closeInfoMessage ? (
            <p className="text-emerald-400 text-xs">{closeInfoMessage}</p>
          ) : null}
          {compactInfoMessage ? (
            <p className="text-emerald-400 text-xs">{compactInfoMessage}</p>
          ) : null}
        </>
      ) : null}
      <details className="rounded-lg border border-border/30 bg-background/45 px-3 py-2">
        <summary className="cursor-pointer text-muted-foreground text-xs uppercase tracking-wide">
          Gateway source details
        </summary>
        <p className="mt-2 text-muted-foreground text-xs">
          Source: {gatewayOverview.source} | Session:{' '}
          <span className="text-foreground">{gatewayOverview.session.id}</span>{' '}
          | Channel:{' '}
          <span className="text-foreground">
            {gatewayOverview.session.channel}
          </span>
        </p>
      </details>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint="persisted gateway status"
          label="Session status"
          value={gatewayOverview.session.status}
        />
        <StatCard
          hint="events currently retained"
          label="Events"
          value={`${gatewayOverview.summary.totals.eventCount}`}
        />
        <StatCard
          hint="draft cycle failures in retained context"
          label="Failed steps"
          value={`${gatewayOverview.summary.totals.failedStepCount}`}
        />
        <StatCard
          hint="compaction runs in retained context"
          label="Compactions"
          value={`${gatewayOverview.summary.compaction.compactCount}`}
        />
        <StatCard
          hint="elapsed window from first to last retained event"
          label="Session duration"
          value={toDurationText(gatewayOverview.summary.totals.durationMs)}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Draft: {gatewayOverview.session.draftId} | Last event:{' '}
        {gatewayOverview.summary.lastEventType ?? 'n/a'} | Top provider:{' '}
        {topGatewayProvider
          ? `${topGatewayProvider[0]} (${topGatewayProvider[1]})`
          : 'n/a'}{' '}
        | Pruned total: {gatewayOverview.summary.compaction.prunedCountTotal}
      </p>
      <div className="grid gap-2">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Recent events
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-xs hover:bg-accent"
            download={`agent-gateway-events-${selectedSessionId}.json`}
            href={jsonExportHref}
          >
            Export JSON
          </a>
          <a
            className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-xs hover:bg-accent"
            download={`agent-gateway-events-${selectedSessionId}.csv`}
            href={csvExportHref}
          >
            Export CSV
          </a>
        </div>
        {recentEventsContent}
      </div>
    </>
  );
};
