interface DebugContextRow {
  label: string;
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

export const DebugDiagnosticsSection = ({
  attentionSessionsCount,
  debugContextRows,
  debugPayloadText,
  eventsSampleCount,
  releaseAlertsCount,
  runtimeProvidersCount,
}: {
  attentionSessionsCount: string;
  debugContextRows: DebugContextRow[];
  debugPayloadText: string;
  eventsSampleCount: number;
  releaseAlertsCount: string;
  runtimeProvidersCount: number;
}) => (
  <section className="card grid gap-4 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold text-foreground text-lg">
        Debug diagnostics
      </h2>
      <span className="inline-flex items-center rounded-full border border-border/45 bg-background/45 px-2 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        raw telemetry
      </span>
    </div>
    <p className="text-muted-foreground text-sm">
      Raw context moved here to keep operational tabs clean. Use this tab only
      for investigations.
    </p>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        hint="events sampled from selected session in debug payload"
        label="Events sample"
        value={`${eventsSampleCount}`}
      />
      <StatCard
        hint="gateway alert sessions in sampled telemetry"
        label="Attention sessions"
        value={attentionSessionsCount}
      />
      <StatCard
        hint="runtime providers returned by health snapshot"
        label="Runtime providers"
        value={`${runtimeProvidersCount}`}
      />
      <StatCard
        hint="release-health webhook events in current window"
        label="Release alerts"
        value={releaseAlertsCount}
      />
    </div>
    <article className="card grid gap-2 p-4">
      <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
        Context snapshot
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-3">Key</th>
              <th className="px-3 py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {debugContextRows.map((entry) => (
              <tr
                className="border-border/25 border-b last:border-b-0"
                key={entry.label}
              >
                <td className="py-2 pr-3 font-medium text-foreground">
                  {entry.label}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {entry.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
    <details className="rounded-xl border border-border/30 bg-background/45 p-3">
      <summary className="cursor-pointer font-semibold text-foreground text-xs uppercase tracking-wide">
        Raw payload snapshot (JSON)
      </summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-border/30 bg-background/80 p-3 text-muted-foreground text-xs">
        {debugPayloadText}
      </pre>
    </details>
  </section>
);
