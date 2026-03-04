import type { ComponentProps } from 'react';

import { GatewaySectionBody } from './gateway-section-body';
import { GatewayTelemetrySectionBody } from './gateway-telemetry-section-body';
import { RuntimeSectionBody } from './runtime-section-body';

type GatewaySectionBodyProps = ComponentProps<typeof GatewaySectionBody>;
type GatewayTelemetrySectionBodyProps = ComponentProps<
  typeof GatewayTelemetrySectionBody
>;
type RuntimeSectionBodyProps = ComponentProps<typeof RuntimeSectionBody>;

export const GatewayPanels = ({
  gatewayHealthBadgeClassName,
  gatewayHealthLabel,
  isVisible,
  liveBodyProps,
  showGatewayHealthBadge,
  telemetryBodyProps,
  telemetryHealthBadgeClassName,
  telemetryHealthLabel,
}: {
  gatewayHealthBadgeClassName: string;
  gatewayHealthLabel: string;
  isVisible: boolean;
  liveBodyProps: GatewaySectionBodyProps;
  showGatewayHealthBadge: boolean;
  telemetryBodyProps: GatewayTelemetrySectionBodyProps;
  telemetryHealthBadgeClassName: string;
  telemetryHealthLabel: string;
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <>
      <section className="card grid gap-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground text-lg">
            Agent gateway live session
          </h2>
          {showGatewayHealthBadge ? (
            <span
              className={`${gatewayHealthBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
            >
              {gatewayHealthLabel}
            </span>
          ) : null}
        </div>
        <GatewaySectionBody {...liveBodyProps} />
      </section>

      <section className="card grid gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground text-lg">
            Agent gateway control-plane telemetry
          </h2>
          <span
            className={`${telemetryHealthBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
          >
            Telemetry health: {telemetryHealthLabel}
          </span>
        </div>
        <GatewayTelemetrySectionBody {...telemetryBodyProps} />
      </section>
    </>
  );
};

export const RuntimePanel = ({
  bodyProps,
  isVisible,
  runtimeHealthBadgeClassName,
  runtimeHealthLabel,
}: {
  bodyProps: RuntimeSectionBodyProps;
  isVisible: boolean;
  runtimeHealthBadgeClassName: string;
  runtimeHealthLabel: string;
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <section className="card grid gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground text-lg">
          AI runtime failover
        </h2>
        <span
          className={`${runtimeHealthBadgeClassName} inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-xs uppercase tracking-wide`}
        >
          {runtimeHealthLabel}
        </span>
      </div>
      <RuntimeSectionBody {...bodyProps} />
    </section>
  );
};
