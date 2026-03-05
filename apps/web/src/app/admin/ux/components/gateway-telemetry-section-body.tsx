import type { ReactNode } from 'react';

interface GatewayRiskSignalView {
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
}

interface GatewayScopeRow {
  key: string;
  value: string;
}

interface GatewayTelemetryStatCard {
  hint: string;
  label: string;
  value: string;
}

interface GatewayEventCounter {
  key: string;
  value: string;
}

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

export const GatewayTelemetrySectionBody = ({
  activePanel,
  allMetricsView = 'overview',
  appliedGatewayChannelFilter,
  appliedGatewayProviderFilter,
  appliedGatewaySessionStatusInputValue,
  channelUsageCard,
  compactionTrendCard,
  eventCounters,
  eventQuery,
  eventsLimit,
  eventTypeFilter,
  expandAllGroups = false,
  gatewayScopeOverridesApplied,
  gatewayScopeRows,
  gatewaySourceFilter,
  hours,
  providerUsageCard,
  resetScopeHref,
  riskSignals,
  selectedSessionId,
  statCards,
  telemetryError,
  thresholdsCard,
}: {
  activePanel: string;
  allMetricsView?: string;
  appliedGatewayChannelFilter: string | null;
  appliedGatewayProviderFilter: string | null;
  appliedGatewaySessionStatusInputValue: string;
  channelUsageCard: ReactNode;
  compactionTrendCard: ReactNode;
  eventCounters: GatewayEventCounter[];
  eventQuery: string;
  eventsLimit: number;
  eventTypeFilter: string;
  expandAllGroups?: boolean;
  gatewayScopeOverridesApplied: boolean;
  gatewayScopeRows: GatewayScopeRow[];
  gatewaySourceFilter: string | null;
  hours: number;
  providerUsageCard: ReactNode;
  resetScopeHref: string;
  riskSignals: GatewayRiskSignalView[];
  selectedSessionId: string | null;
  statCards: GatewayTelemetryStatCard[];
  telemetryError: string | null;
  thresholdsCard: ReactNode;
}) => (
  <>
    <article className="card grid gap-2 p-3">
      <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
        Risk signals
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {riskSignals.map((signal) => (
          <div
            className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/55 px-3 py-2"
            key={signal.id}
          >
            <p className="font-medium text-foreground text-xs">
              {signal.label}
            </p>
            <span
              className={`${signal.badgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
            >
              {signal.badgeLabel}
            </span>
          </div>
        ))}
      </div>
    </article>
    {telemetryError ? (
      <p className="text-muted-foreground text-sm">{telemetryError}</p>
    ) : (
      <>
        <details
          className="rounded-xl border border-border/30 bg-background/45 p-3"
          open={gatewayScopeOverridesApplied}
        >
          <summary className="cursor-pointer font-semibold text-foreground text-xs uppercase tracking-wide">
            Scope and source controls
          </summary>
          <form className="mt-3 flex flex-wrap items-end gap-2" method="get">
            <input name="hours" type="hidden" value={`${hours}`} />
            <input name="panel" type="hidden" value={activePanel} />
            {activePanel === 'all' && allMetricsView !== 'overview' ? (
              <input name="allView" type="hidden" value={allMetricsView} />
            ) : null}
            {activePanel === 'all' && expandAllGroups ? (
              <input name="expand" type="hidden" value="all" />
            ) : null}
            <label
              className="grid gap-1 text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-source-scope-select"
            >
              Source
              <select
                className="w-32 rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm normal-case tracking-normal"
                defaultValue={gatewaySourceFilter ?? ''}
                id="gateway-source-scope-select"
                name="gatewaySource"
              >
                <option value="">db</option>
                <option value="memory">memory</option>
              </select>
            </label>
            {selectedSessionId ? (
              <input name="session" type="hidden" value={selectedSessionId} />
            ) : null}
            <input name="eventsLimit" type="hidden" value={`${eventsLimit}`} />
            <input name="eventType" type="hidden" value={eventTypeFilter} />
            <input name="eventQuery" type="hidden" value={eventQuery} />
            <label
              className="grid gap-1 text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-channel-scope-input"
            >
              Channel scope
              <input
                className="w-48 rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm normal-case tracking-normal"
                defaultValue={appliedGatewayChannelFilter ?? ''}
                id="gateway-channel-scope-input"
                name="gatewayChannel"
                placeholder="all channels"
                type="text"
              />
            </label>
            <label
              className="grid gap-1 text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-provider-scope-input"
            >
              Provider scope
              <input
                className="w-44 rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm normal-case tracking-normal"
                defaultValue={appliedGatewayProviderFilter ?? ''}
                id="gateway-provider-scope-input"
                name="gatewayProvider"
                placeholder="all providers"
                type="text"
              />
            </label>
            <label
              className="grid gap-1 text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="gateway-status-scope-select"
            >
              Session status
              <select
                className="w-36 rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm normal-case tracking-normal"
                defaultValue={appliedGatewaySessionStatusInputValue}
                id="gateway-status-scope-select"
                name="gatewayStatus"
              >
                <option value="">all statuses</option>
                <option value="active">active</option>
                <option value="closed">closed</option>
              </select>
            </label>
            <button
              className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-sm hover:bg-accent"
              type="submit"
            >
              Apply scope
            </button>
            <a
              className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-sm hover:bg-accent"
              href={resetScopeHref}
            >
              Reset scope
            </a>
          </form>
        </details>
        <article className="card grid gap-2 p-3">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Applied scope
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {gatewayScopeRows.map((row) => (
              <div
                className="rounded-lg border border-border/30 bg-background/55 px-3 py-2"
                key={row.key}
              >
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {row.key}
                </p>
                <p className="font-semibold text-foreground text-sm">
                  {row.value}
                </p>
              </div>
            ))}
          </div>
        </article>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatCard
              hint={card.hint}
              key={card.label}
              label={card.label}
              value={card.value}
            />
          ))}
        </div>
        <article className="card grid gap-2 p-3">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
            Event counters
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {eventCounters.map((counter) => (
              <div
                className="rounded-lg border border-border/30 bg-background/55 px-3 py-2"
                key={counter.key}
              >
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {counter.key}
                </p>
                <p className="font-semibold text-foreground text-sm">
                  {counter.value}
                </p>
              </div>
            ))}
          </div>
        </article>
        {compactionTrendCard}
        <div className="grid gap-3 lg:grid-cols-3">
          {thresholdsCard}
          {providerUsageCard}
          {channelUsageCard}
        </div>
      </>
    )}
  </>
);
