exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_agent_gateway_sessions_channel_status_updated
      ON agent_gateway_sessions(channel, status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_agent_gateway_events_session_provider
      ON agent_gateway_events(
        session_id,
        (LOWER(COALESCE(payload->>'selectedProvider', payload->>'provider', '')))
      );

    CREATE INDEX IF NOT EXISTS idx_agent_gateway_events_session_connector
      ON agent_gateway_events(
        session_id,
        (LOWER(COALESCE(payload->>'connectorId', '')))
      );

    CREATE INDEX IF NOT EXISTS idx_agent_gateway_events_session_type_roles_created
      ON agent_gateway_events(session_id, event_type, from_role, to_role, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_agent_gateway_events_session_type_roles_created;
    DROP INDEX IF EXISTS idx_agent_gateway_events_session_connector;
    DROP INDEX IF EXISTS idx_agent_gateway_events_session_provider;
    DROP INDEX IF EXISTS idx_agent_gateway_sessions_channel_status_updated;
  `);
};

