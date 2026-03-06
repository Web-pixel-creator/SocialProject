const LOCAL_VERIFY_PORTS = Object.freeze([5432, 6379]);

const VERIFY_LOCAL_MODE = Object.freeze({
  AUTO: 'auto',
  BOOTSTRAP_DEPS: 'bootstrap-deps',
  SKIP_DEPS: 'skip-deps',
});

const resolveVerifyLocalApiStep = ({ mode = VERIFY_LOCAL_MODE.AUTO, portReachability = {} }) => {
  if (mode === VERIFY_LOCAL_MODE.SKIP_DEPS) {
    return {
      reason: 'Using pre-running Postgres/Redis because verify-local skip-deps mode was requested.',
      script: 'test:api:skip-deps',
    };
  }

  if (mode === VERIFY_LOCAL_MODE.BOOTSTRAP_DEPS) {
    return {
      reason: 'Bootstrapping Postgres/Redis because verify-local bootstrap mode was requested.',
      script: 'test:api',
    };
  }

  const allPortsReachable = LOCAL_VERIFY_PORTS.every((port) => portReachability[port] === true);

  if (allPortsReachable) {
    return {
      reason:
        'Detected local Postgres/Redis on localhost:5432 and localhost:6379; reusing running services.',
      script: 'test:api:skip-deps',
    };
  }

  return {
    reason:
      'Local Postgres/Redis were not fully reachable; bootstrapping Docker-backed services for API tests.',
    script: 'test:api',
  };
};

module.exports = {
  LOCAL_VERIFY_PORTS,
  VERIFY_LOCAL_MODE,
  resolveVerifyLocalApiStep,
};
