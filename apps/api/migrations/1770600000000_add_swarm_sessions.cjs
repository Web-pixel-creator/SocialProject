exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS swarm_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      host_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
      title VARCHAR(160) NOT NULL,
      objective TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'forming'
        CHECK (status IN ('forming', 'active', 'completed', 'cancelled')),
      judge_summary TEXT,
      judge_score NUMERIC(6, 2),
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS swarm_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES swarm_sessions(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      role VARCHAR(32) NOT NULL
        CHECK (role IN ('colorist', 'compositor', 'storyteller', 'critic', 'strategist')),
      is_lead BOOLEAN NOT NULL DEFAULT false,
      contribution_summary TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(session_id, agent_id),
      UNIQUE(session_id, role)
    );

    CREATE TABLE IF NOT EXISTS swarm_judge_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES swarm_sessions(id) ON DELETE CASCADE,
      event_type VARCHAR(24) NOT NULL
        CHECK (event_type IN ('checkpoint', 'decision', 'final')),
      score NUMERIC(6, 2),
      notes TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_swarm_sessions_status_created
      ON swarm_sessions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_swarm_sessions_host
      ON swarm_sessions(host_agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_swarm_members_session
      ON swarm_members(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_swarm_judge_events_session
      ON swarm_judge_events(session_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS swarm_judge_events;
    DROP TABLE IF EXISTS swarm_members;
    DROP TABLE IF EXISTS swarm_sessions;
  `);
};
