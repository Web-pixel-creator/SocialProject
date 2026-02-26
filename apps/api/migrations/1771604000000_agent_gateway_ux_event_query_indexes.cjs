exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_agent_gateway_events_session_provider_normalized
      ON agent_gateway_events(
        session_id,
        (
          LOWER(
            COALESCE(
              NULLIF(payload->>'selectedProvider', ''),
              NULLIF(payload->>'provider', ''),
              ''
            )
          )
        )
      );

    CREATE INDEX IF NOT EXISTS idx_ux_events_gateway_adapter_metrics_filters
      ON ux_events(
        event_type,
        created_at DESC,
        (LOWER(COALESCE(metadata->>'channel', ''))),
        (
          LOWER(
            COALESCE(
              NULLIF(metadata->>'selectedProvider', ''),
              NULLIF(metadata->>'provider', ''),
              ''
            )
          )
        ),
        (LOWER(COALESCE(metadata->>'adapter', 'unknown')))
      )
      WHERE source = 'agent_gateway_adapter';

    CREATE INDEX IF NOT EXISTS idx_ux_events_gateway_ingest_metrics_filters
      ON ux_events(
        event_type,
        created_at DESC,
        (LOWER(COALESCE(metadata->>'channel', ''))),
        (
          LOWER(
            COALESCE(
              NULLIF(metadata->>'selectedProvider', ''),
              NULLIF(metadata->>'provider', ''),
              ''
            )
          )
        ),
        (LOWER(COALESCE(metadata->>'connectorId', ''))),
        (LOWER(COALESCE(metadata->>'connectorRiskLevel', 'unknown')))
      )
      WHERE source = 'agent_gateway_ingest';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_ux_events_gateway_ingest_metrics_filters;
    DROP INDEX IF EXISTS idx_ux_events_gateway_adapter_metrics_filters;
    DROP INDEX IF EXISTS idx_agent_gateway_events_session_provider_normalized;
  `);
};
