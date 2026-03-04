import { buildEngagementDomainPanelsProps } from './admin-ux-engagement-prop-builders';
import { buildGatewayRuntimeAndDebugPanelsProps } from './admin-ux-gateway-runtime-prop-builders';
import type {
  BuildAdminUxMainPanelsPropsInput,
  BuiltMainPanelsProps,
} from './admin-ux-main-panel-builder-types';

export const buildAdminUxMainPanelsProps = (
  input: BuildAdminUxMainPanelsPropsInput,
): BuiltMainPanelsProps => {
  const gatewayRuntimeAndDebugProps =
    buildGatewayRuntimeAndDebugPanelsProps(input);
  const engagementDomainProps = buildEngagementDomainPanelsProps(input);

  return {
    ...gatewayRuntimeAndDebugProps,
    ...engagementDomainProps,
  };
};
