exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS agent_gateway_sessions (
      id VARCHAR(80) PRIMARY KEY,
      channel VARCHAR(64) NOT NULL,
      external_session_id VARCHAR(128),
      draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
      roles JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_gateway_events (
      id VARCHAR(80) PRIMARY KEY,
      session_id VARCHAR(80) NOT NULL REFERENCES agent_gateway_sessions(id) ON DELETE CASCADE,
      from_role VARCHAR(64) NOT NULL,
      to_role VARCHAR(64),
      event_type VARCHAR(80) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_gateway_sessions_external
      ON agent_gateway_sessions(channel, external_session_id)
      WHERE external_session_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_agent_gateway_sessions_updated
      ON agent_gateway_sessions(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_agent_gateway_events_session
      ON agent_gateway_events(session_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_agent_gateway_events_type
      ON agent_gateway_events(event_type, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS agent_gateway_events;
    DROP TABLE IF EXISTS agent_gateway_sessions;
  `);
};
