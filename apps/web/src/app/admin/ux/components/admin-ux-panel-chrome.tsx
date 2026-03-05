interface PanelTabView {
  active: boolean;
  href: string;
  id: string;
  label: string;
}

interface StickyKpiView {
  badgeClassName: string;
  badgeLabel: string;
  id: string;
  label: string;
  value: string;
}

interface AllMetricsControlsView {
  collapseHref: string;
  expandHref: string;
  expanded: boolean;
}

interface AllMetricsViewTab {
  active: boolean;
  href: string;
  id: string;
  label: string;
}

interface AllMetricsRiskFilterTab {
  active: boolean;
  href: string;
  id: string;
  label: string;
}

interface AllMetricsRiskSnapshot {
  critical: number;
  healthy: number;
  neutral: number;
  watch: number;
}

export const AdminUxPanelChrome = ({
  activePanel,
  allMetricsControls,
  allMetricsRiskFilterTabs,
  allMetricsRiskSnapshot,
  allMetricsViewTabs,
  panelTabs,
  stickyKpis,
}: {
  activePanel: string;
  allMetricsControls: AllMetricsControlsView | null;
  allMetricsRiskFilterTabs: AllMetricsRiskFilterTab[] | null;
  allMetricsRiskSnapshot: AllMetricsRiskSnapshot | null;
  allMetricsViewTabs: AllMetricsViewTab[] | null;
  panelTabs: PanelTabView[];
  stickyKpis: StickyKpiView[];
}) => (
  <>
    <section className="card grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {panelTabs.map((tab) => (
          <a
            className={`inline-flex items-center rounded-full border px-3 py-1.5 font-semibold text-xs transition-colors ${
              tab.active
                ? 'border-primary/70 bg-primary/15 text-primary'
                : 'border-border/45 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            href={tab.href}
            key={tab.id}
          >
            {tab.label}
          </a>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Focus view: <span className="text-foreground">{activePanel}</span>. Use
        tabs to reduce noise and scan one domain at a time.
      </p>
      {allMetricsRiskFilterTabs ? (
        <div className="grid gap-2 border-border/30 border-t pt-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Severity filter
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {allMetricsRiskFilterTabs.map((tab) => (
              <a
                aria-label={`${tab.label}. ${
                  tab.id === 'high'
                    ? 'Shows only sections currently marked critical or watch in selected focus.'
                    : 'Shows all section severities in selected focus.'
                }`}
                className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold text-xs transition-colors ${
                  tab.active
                    ? 'border-primary/70 bg-primary/15 text-primary'
                    : 'border-border/45 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
                href={tab.href}
                key={tab.id}
                title={
                  tab.id === 'high'
                    ? 'Shows only sections currently marked critical or watch in selected focus.'
                    : 'Shows all section severities in selected focus.'
                }
              >
                {tab.label}
              </a>
            ))}
          </div>
          {allMetricsRiskSnapshot ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-destructive/45 bg-destructive/10 px-2 py-0.5 font-semibold text-[11px] text-destructive-foreground uppercase tracking-wide">
                critical {allMetricsRiskSnapshot.critical}
              </span>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/12 px-2 py-0.5 font-semibold text-[11px] text-amber-200 uppercase tracking-wide">
                watch {allMetricsRiskSnapshot.watch}
              </span>
              <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-semibold text-[11px] text-emerald-200 uppercase tracking-wide">
                healthy {allMetricsRiskSnapshot.healthy}
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-[11px] text-primary uppercase tracking-wide">
                info {allMetricsRiskSnapshot.neutral}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {allMetricsViewTabs ? (
        <div className="grid gap-2 border-border/30 border-t pt-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            All metrics focus
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {allMetricsViewTabs.map((tab) => (
              <a
                className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold text-xs transition-colors ${
                  tab.active
                    ? 'border-primary/70 bg-primary/15 text-primary'
                    : 'border-border/45 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
                href={tab.href}
                key={tab.id}
              >
                {tab.label}
              </a>
            ))}
          </div>
          <p className="text-muted-foreground/90 text-xs">
            Section order: severity first (critical -&gt; watch -&gt; healthy
            -&gt; info).
          </p>
        </div>
      ) : null}
      {allMetricsControls ? (
        <div className="flex flex-wrap items-center gap-2 border-border/30 border-t pt-2">
          <a
            className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold text-xs transition-colors ${
              allMetricsControls.expanded
                ? 'border-primary/70 bg-primary/15 text-primary'
                : 'border-border/45 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
            href={allMetricsControls.expandHref}
          >
            Expand all
          </a>
          <a
            className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold text-xs transition-colors ${
              allMetricsControls.expanded
                ? 'border-border/45 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                : 'border-primary/70 bg-primary/15 text-primary'
            }`}
            href={allMetricsControls.collapseHref}
          >
            Collapse all
          </a>
          <span className="text-muted-foreground text-xs">
            State:{' '}
            <span className="font-semibold text-foreground">
              {allMetricsControls.expanded ? 'expanded' : 'collapsed'}
            </span>
          </span>
        </div>
      ) : null}
    </section>

    {stickyKpis.length > 0 ? (
      <section className="card grid gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground text-lg">Key signals</h2>
          <span className="inline-flex items-center rounded-full border border-border/45 bg-background/55 px-2 py-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            24h snapshot
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stickyKpis.map((kpi) => (
            <article
              className="flex items-center justify-between gap-2 rounded-xl border border-border/35 bg-background/50 px-3 py-3"
              key={kpi.id}
            >
              <div className="min-w-0">
                <p className="truncate text-muted-foreground text-xs uppercase tracking-wide">
                  {kpi.label}
                </p>
                <p className="font-semibold text-foreground text-lg">
                  {kpi.value}
                </p>
              </div>
              <span
                className={`${kpi.badgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
              >
                {kpi.badgeLabel}
              </span>
            </article>
          ))}
        </div>
      </section>
    ) : null}
  </>
);
