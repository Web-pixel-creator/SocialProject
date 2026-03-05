interface RuntimeRoleProfile {
  availableProviders: string[];
  blockedProviders: string[];
  providers: string[];
  role: string;
}

interface RuntimeProviderState {
  coolingDown: boolean;
  cooldownUntil: string | null;
  provider: string;
}

interface RuntimeSummary {
  health: string;
  providerCount: number;
  providersCoolingDown: number;
  providersReady: number;
  roleCount: number;
  rolesBlocked: number;
}

interface RuntimeDryRunAttempt {
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  provider: string;
  status: string;
}

interface RuntimeDryRunResult {
  attempts: RuntimeDryRunAttempt[];
  failed: boolean;
  output: string | null;
  role: string;
  selectedProvider: string | null;
}

interface RuntimeScopeFields {
  eventQuery: string;
  eventTypeFilter: string;
  eventsLimit: number;
  gatewaySessionStatusInputValue: string;
  gatewaySourceFilter: string | null;
  selectedSessionId: string | null;
  sessionChannelFilter: string | null;
  sessionProviderFilter: string | null;
}

const MetricCard = ({
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

export const RuntimeSectionBody = ({
  aiFailuresCsv,
  aiPrompt,
  aiProvidersCsv,
  aiRole,
  aiRuntimeDryRunErrorMessage,
  aiRuntimeDryRunInfoMessage,
  aiRuntimeDryRunResult,
  aiRuntimeHealthError,
  aiRuntimeHealthGeneratedAt,
  aiRuntimeProviders,
  aiRuntimeRoleStates,
  aiRuntimeSummary,
  aiTimeoutMs,
  expandAllGroups = false,
  hours,
  panel,
  roleOptions,
  scopeFields,
}: {
  aiFailuresCsv: string;
  aiPrompt: string;
  aiProvidersCsv: string;
  aiRole: string;
  aiRuntimeDryRunErrorMessage: string | null;
  aiRuntimeDryRunInfoMessage: string | null;
  aiRuntimeDryRunResult: RuntimeDryRunResult | null;
  aiRuntimeHealthError: string | null;
  aiRuntimeHealthGeneratedAt: string | null;
  aiRuntimeProviders: RuntimeProviderState[];
  aiRuntimeRoleStates: RuntimeRoleProfile[];
  aiRuntimeSummary: RuntimeSummary;
  aiTimeoutMs: number | undefined;
  expandAllGroups?: boolean;
  hours: number;
  panel: string;
  roleOptions: string[];
  scopeFields: RuntimeScopeFields;
}) => {
  if (aiRuntimeHealthError) {
    return (
      <p className="text-muted-foreground text-sm">{aiRuntimeHealthError}</p>
    );
  }

  const hasProfiles = aiRuntimeRoleStates.length > 0;
  const hasProviders = aiRuntimeProviders.length > 0;
  const hasBlockedRoles = aiRuntimeSummary.rolesBlocked > 0;
  const hasCoolingProviders = aiRuntimeSummary.providersCoolingDown > 0;
  const cooldownRows = aiRuntimeProviders.map((providerState) => ({
    ...providerState,
    isCoolingDown: providerState.coolingDown,
  }));
  const isDryRunPanelOpen =
    aiRuntimeDryRunResult !== null ||
    aiRuntimeDryRunErrorMessage !== null ||
    aiRuntimeDryRunInfoMessage !== null;
  const runtimeOverviewRows: Array<{ key: string; value: string }> = [
    {
      key: 'Runtime health',
      value: aiRuntimeSummary.health,
    },
    {
      key: 'Roles blocked',
      value: `${aiRuntimeSummary.rolesBlocked}`,
    },
    {
      key: 'Providers cooling down',
      value: `${aiRuntimeSummary.providersCoolingDown}`,
    },
    {
      key: 'Generated (UTC)',
      value: aiRuntimeHealthGeneratedAt ?? 'n/a',
    },
  ];

  return (
    <div className="grid gap-4">
      <article className="card grid gap-2 p-3">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Runtime snapshot
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {runtimeOverviewRows.map((row) => (
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
      {hasBlockedRoles ? (
        <article className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <p className="font-semibold text-destructive text-xs uppercase tracking-wide">
            Critical alert
          </p>
          <p className="mt-1 text-foreground text-xs">
            {aiRuntimeSummary.rolesBlocked} role(s) are blocked with no
            available providers in the current failover chain.
          </p>
        </article>
      ) : null}
      {!hasBlockedRoles && hasCoolingProviders ? (
        <article className="rounded-xl border border-border/30 bg-accent/35 p-3">
          <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
            Warning
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {aiRuntimeSummary.providersCoolingDown} provider(s) are in cooldown.
            Failover is active, but capacity is reduced.
          </p>
        </article>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="roles configured in runtime chain"
          label="Roles"
          value={`${aiRuntimeSummary.roleCount}`}
        />
        <MetricCard
          hint="providers available across all role chains"
          label="Providers"
          value={`${aiRuntimeSummary.providerCount}`}
        />
        <MetricCard
          hint="providers currently in cooldown window"
          label="Cooling down"
          value={`${aiRuntimeSummary.providersCoolingDown}`}
        />
        <MetricCard
          hint="roles with no available provider"
          label="Roles blocked"
          value={`${aiRuntimeSummary.rolesBlocked}`}
        />
        <MetricCard
          hint="providers ready for next inference"
          label="Providers ready"
          value={`${aiRuntimeSummary.providersReady}`}
        />
      </div>
      <article className="card grid gap-3 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Role and provider matrix
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Role profiles
            </p>
            {hasProfiles ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                      <th className="py-2 pr-3">Role</th>
                      <th className="px-3 py-2">Provider chain</th>
                      <th className="px-3 py-2 text-right">Ready</th>
                      <th className="px-3 py-2 text-right">Blocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiRuntimeRoleStates.map((profile) => (
                      <tr
                        className="border-border/25 border-b last:border-b-0"
                        key={profile.role}
                      >
                        <td className="py-2 pr-3 font-medium text-foreground">
                          {profile.role}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {profile.providers.join(' -> ') || 'n/a'}
                        </td>
                        <td className="px-3 py-2 text-right text-foreground">
                          {profile.availableProviders.length}
                        </td>
                        <td className="px-3 py-2 text-right text-foreground">
                          {profile.blockedProviders.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                No runtime profiles returned.
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Provider states
            </p>
            {hasProviders ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                      <th className="py-2 pr-3">Provider</th>
                      <th className="px-3 py-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cooldownRows.map((providerState) => (
                      <tr
                        className="border-border/25 border-b last:border-b-0"
                        key={providerState.provider}
                      >
                        <td className="py-2 pr-3 font-medium text-foreground">
                          {providerState.provider}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {providerState.isCoolingDown
                            ? `cooldown active (${providerState.cooldownUntil})`
                            : 'ready'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                No provider state data.
              </p>
            )}
          </div>
        </div>
      </article>
      <details
        className="rounded-xl border border-border/30 bg-background/45 p-3"
        open={isDryRunPanelOpen}
      >
        <summary className="cursor-pointer font-semibold text-foreground text-xs uppercase tracking-wide">
          Dry-run simulator
        </summary>
        <form className="mt-3 grid gap-2" method="get">
          <input name="hours" type="hidden" value={`${hours}`} />
          <input name="panel" type="hidden" value={panel} />
          {panel === 'all' && expandAllGroups ? (
            <input name="expand" type="hidden" value="all" />
          ) : null}
          <input
            name="gatewaySource"
            type="hidden"
            value={scopeFields.gatewaySourceFilter ?? ''}
          />
          {scopeFields.sessionChannelFilter ? (
            <input
              name="gatewayChannel"
              type="hidden"
              value={scopeFields.sessionChannelFilter}
            />
          ) : null}
          {scopeFields.sessionProviderFilter ? (
            <input
              name="gatewayProvider"
              type="hidden"
              value={scopeFields.sessionProviderFilter}
            />
          ) : null}
          <input
            name="gatewayStatus"
            type="hidden"
            value={scopeFields.gatewaySessionStatusInputValue}
          />
          {scopeFields.selectedSessionId ? (
            <input
              name="session"
              type="hidden"
              value={scopeFields.selectedSessionId}
            />
          ) : null}
          <input
            name="eventsLimit"
            type="hidden"
            value={`${scopeFields.eventsLimit}`}
          />
          <input
            name="eventType"
            type="hidden"
            value={scopeFields.eventTypeFilter}
          />
          <input
            name="eventQuery"
            type="hidden"
            value={scopeFields.eventQuery}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label
              className="text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="ai-runtime-role"
            >
              Role
            </label>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
              defaultValue={aiRole}
              id="ai-runtime-role"
              name="aiRole"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <label
              className="text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="ai-runtime-timeout"
            >
              Timeout (ms)
            </label>
            <input
              className="w-32 rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
              defaultValue={`${aiTimeoutMs ?? 12_000}`}
              id="ai-runtime-timeout"
              max={120_000}
              min={250}
              name="aiTimeoutMs"
              type="number"
            />
            <button
              className="rounded-md border border-border bg-background px-3 py-1 text-foreground text-sm hover:bg-accent"
              name="aiDryRun"
              type="submit"
              value="1"
            >
              Run dry-run
            </button>
          </div>
          <label
            className="text-muted-foreground text-xs uppercase tracking-wide"
            htmlFor="ai-runtime-prompt"
          >
            Prompt
          </label>
          <input
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
            defaultValue={aiPrompt}
            id="ai-runtime-prompt"
            name="aiPrompt"
            required
            type="text"
          />
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs uppercase tracking-wide"
                htmlFor="ai-runtime-providers"
              >
                Providers override (csv)
              </label>
              <input
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
                defaultValue={aiProvidersCsv}
                id="ai-runtime-providers"
                name="aiProviders"
                placeholder="claude-4,gpt-4.1"
                type="text"
              />
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs uppercase tracking-wide"
                htmlFor="ai-runtime-failures"
              >
                Simulate failures (csv)
              </label>
              <input
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
                defaultValue={aiFailuresCsv}
                id="ai-runtime-failures"
                name="aiFailures"
                placeholder="claude-4"
                type="text"
              />
            </div>
          </div>
        </form>
        {aiRuntimeDryRunErrorMessage ? (
          <p className="mt-2 text-red-400 text-xs">
            {aiRuntimeDryRunErrorMessage}
          </p>
        ) : null}
        {aiRuntimeDryRunInfoMessage ? (
          <p className="mt-2 text-emerald-400 text-xs">
            {aiRuntimeDryRunInfoMessage}
          </p>
        ) : null}
        {aiRuntimeDryRunResult ? (
          <article className="mt-3 rounded-xl border border-border/25 bg-background/60 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Dry-run result
            </p>
            <p className="mt-1 text-foreground text-xs">
              Role: {aiRuntimeDryRunResult.role} | Selected:{' '}
              {aiRuntimeDryRunResult.selectedProvider ?? 'n/a'} | Failed:{' '}
              {aiRuntimeDryRunResult.failed ? 'yes' : 'no'}
            </p>
            {aiRuntimeDryRunResult.output ? (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-border/30 bg-background/80 p-2 text-muted-foreground text-xs">
                {aiRuntimeDryRunResult.output}
              </pre>
            ) : null}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 pr-3">Provider</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Latency</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {aiRuntimeDryRunResult.attempts.map((attempt, index) => (
                    <tr
                      className="border-border/25 border-b last:border-b-0"
                      key={`${attempt.provider}:${index + 1}`}
                    >
                      <td className="py-2 pr-3 text-foreground">
                        {attempt.provider}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {attempt.status}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {attempt.latencyMs !== null
                          ? `${attempt.latencyMs}ms`
                          : 'n/a'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {attempt.errorCode && attempt.errorCode.length > 0
                          ? `${attempt.errorCode}${
                              attempt.errorMessage &&
                              attempt.errorMessage.length > 0
                                ? `: ${attempt.errorMessage}`
                                : ''
                            }`
                          : 'none'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
      </details>
    </div>
  );
};
