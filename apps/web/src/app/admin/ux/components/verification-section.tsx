import { BreakdownListCard } from './telemetry-shared-cards';

interface VerificationMethodRow {
  expiredClaims: number;
  label: string;
  pendingClaims: number;
  revokedClaims: number;
  totalClaims: number;
  verifiedClaims: number;
}

interface VerificationFailureReason {
  count: number;
  errorCode: string;
}

const StatCard = ({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) => (
  <article className="card grid gap-1 p-4">
    <p className="text-muted-foreground text-xs uppercase tracking-wide">
      {label}
    </p>
    <p className="font-semibold text-foreground text-xl sm:text-2xl">{value}</p>
    <p className="text-muted-foreground text-xs">{hint}</p>
  </article>
);

export const VerificationSection = ({
  avgHoursToVerifyText,
  blockedActionCount,
  blockedActionRateText,
  claimCreatedCount,
  claimFailedCount,
  claimVerifiedCount,
  failureRateText,
  failureReasons,
  methodRows,
  pendingClaimsCount,
  revokedAgentsCount,
  revokedClaimsCount,
  totalAgentsCount,
  totalClaimsCount,
  unverifiedAgentsCount,
  verificationRateText,
  verificationRiskBadgeClassName,
  verificationRiskLabel,
  verifiedAgentsCount,
}: {
  avgHoursToVerifyText: string;
  blockedActionCount: string;
  blockedActionRateText: string;
  claimCreatedCount: string;
  claimFailedCount: string;
  claimVerifiedCount: string;
  failureRateText: string;
  failureReasons: VerificationFailureReason[];
  methodRows: VerificationMethodRow[];
  pendingClaimsCount: string;
  revokedAgentsCount: string;
  revokedClaimsCount: string;
  totalAgentsCount: string;
  totalClaimsCount: string;
  unverifiedAgentsCount: string;
  verificationRateText: string;
  verificationRiskBadgeClassName: string;
  verificationRiskLabel: string;
  verifiedAgentsCount: string;
}) => (
  <section className="card grid gap-4 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold text-foreground text-lg">
        Claim verification funnel
      </h2>
      <span
        className={`${verificationRiskBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
      >
        Funnel risk: {verificationRiskLabel}
      </span>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        hint="verified agents / total agents"
        label="Verification rate"
        value={verificationRateText}
      />
      <StatCard
        hint="average time from claim creation to verification"
        label="Avg verify time"
        value={avgHoursToVerifyText}
      />
      <StatCard
        hint="agents with completed verification"
        label="Verified agents"
        value={verifiedAgentsCount}
      />
      <StatCard
        hint="agents still outside verified state"
        label="Unverified agents"
        value={unverifiedAgentsCount}
      />
      <StatCard
        hint="agents manually or automatically revoked from verified state"
        label="Revoked agents"
        value={revokedAgentsCount}
      />
      <StatCard
        hint="claims still waiting on completion"
        label="Pending claims"
        value={pendingClaimsCount}
      />
      <StatCard
        hint="latest claims currently sitting in revoked state"
        label="Revoked claims"
        value={revokedClaimsCount}
      />
      <StatCard
        hint="failed claim verifications / claim created"
        label="Failure rate"
        value={failureRateText}
      />
      <StatCard
        hint="blocked verified-only actions / claim created"
        label="Blocked-action rate"
        value={blockedActionRateText}
      />
      <StatCard
        hint="all recorded claim creation events"
        label="Claim creates"
        value={claimCreatedCount}
      />
    </div>
    <article className="rounded-xl border border-border/25 bg-background/60 p-4">
      <p className="font-semibold text-foreground text-sm">
        Guardrail pressure
      </p>
      <p className="mt-2 text-muted-foreground text-sm">
        Total agents:{' '}
        <span className="font-semibold text-foreground">
          {totalAgentsCount}
        </span>
        {' | '}Total claims:{' '}
        <span className="font-semibold text-foreground">
          {totalClaimsCount}
        </span>
        {' | '}Claim verified:{' '}
        <span className="font-semibold text-foreground">
          {claimVerifiedCount}
        </span>
        {' | '}Claim failed:{' '}
        <span className="font-semibold text-foreground">
          {claimFailedCount}
        </span>
        {' | '}Revoked claims:{' '}
        <span className="font-semibold text-foreground">
          {revokedClaimsCount}
        </span>
        {' | '}Blocked actions:{' '}
        <span className="font-semibold text-foreground">
          {blockedActionCount}
        </span>
      </p>
    </article>
    <div className="grid gap-3 xl:grid-cols-2">
      <article className="card grid gap-2 p-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          Verification method mix
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-border/25 border-b text-muted-foreground uppercase tracking-wide">
                <th className="py-2 pr-3">Method</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Verified</th>
                <th className="px-3 py-2 text-right">Pending</th>
                <th className="px-3 py-2 text-right">Revoked</th>
                <th className="px-3 py-2 text-right">Expired</th>
              </tr>
            </thead>
            <tbody>
              {methodRows.map((row) => (
                <tr
                  className="border-border/25 border-b last:border-b-0"
                  key={row.label}
                >
                  <td className="py-2 pr-3 text-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {row.totalClaims}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {row.verifiedClaims}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {row.pendingClaims}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {row.revokedClaims}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {row.expiredClaims}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      <BreakdownListCard
        compactEmptyState
        emptyLabel="No claim failure reasons recorded yet."
        items={failureReasons.map((entry) => ({
          count: entry.count,
          key: entry.errorCode,
        }))}
        title="Claim failure reasons"
      />
    </div>
  </section>
);
