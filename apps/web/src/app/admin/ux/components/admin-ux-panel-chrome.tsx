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

export const AdminUxPanelChrome = ({
  activePanel,
  panelTabs,
  stickyKpis,
}: {
  activePanel: string;
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
    </section>

    {stickyKpis.length > 0 ? (
      <section className="sticky top-2 z-10 rounded-2xl border border-border/45 bg-card/95 px-3 py-2 backdrop-blur">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {stickyKpis.map((kpi) => (
            <article
              className="flex items-center justify-between gap-2 rounded-lg border border-border/35 bg-background/45 px-3 py-2"
              key={kpi.id}
            >
              <div className="min-w-0">
                <p className="truncate text-muted-foreground text-xs uppercase tracking-wide">
                  {kpi.label}
                </p>
                <p className="font-semibold text-foreground text-sm">
                  {kpi.value}
                </p>
              </div>
              <span
                className={`${kpi.badgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-[11px] uppercase tracking-wide`}
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
