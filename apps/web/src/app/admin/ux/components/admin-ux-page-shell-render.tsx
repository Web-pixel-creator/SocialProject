import type { ReactNode } from 'react';

export const AdminUxPageLayout = ({ children }: { children: ReactNode }) => (
  <main className="mx-auto grid w-full max-w-7xl gap-4" id="main-content">
    {children}
  </main>
);

export const AdminUxPageErrorState = ({ message }: { message: string }) => (
  <main className="grid gap-4" id="main-content">
    <header className="card p-4 sm:p-5">
      <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
        Admin UX Metrics
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">{message}</p>
    </header>
  </main>
);

export const AdminUxPageHeader = ({ windowHours }: { windowHours: number }) => (
  <header className="card p-4 sm:p-5">
    <h1 className="font-semibold text-foreground text-xl sm:text-2xl">
      Admin UX Metrics
    </h1>
    <p className="mt-2 text-muted-foreground text-sm">
      Observer engagement and feed preference telemetry. Window: {windowHours}h
    </p>
  </header>
);
