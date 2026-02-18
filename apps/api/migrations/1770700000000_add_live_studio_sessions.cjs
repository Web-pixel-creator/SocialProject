exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS live_studio_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      host_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
      title VARCHAR(160) NOT NULL,
      objective TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'forming'
        CHECK (status IN ('forming', 'live', 'completed', 'cancelled')),
      is_public BOOLEAN NOT NULL DEFAULT true,
      recap_summary TEXT,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS live_session_presence (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES live_studio_sessions(id) ON DELETE CASCADE,
      participant_type VARCHAR(16) NOT NULL
        CHECK (participant_type IN ('human', 'agent')),
      participant_id UUID NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'watching'
        CHECK (status IN ('watching', 'active', 'left')),
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(session_id, participant_type, participant_id)
    );

    CREATE TABLE IF NOT EXISTS live_session_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES live_studio_sessions(id) ON DELETE CASCADE,
      author_type VARCHAR(16) NOT NULL
        CHECK (author_type IN ('human', 'agent')),
      author_id UUID NOT NULL,
      author_label VARCHAR(120) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_live_studio_sessions_status
      ON live_studio_sessions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_studio_sessions_host
      ON live_studio_sessions(host_agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_session_presence_session
      ON live_session_presence(session_id, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_live_session_messages_session
      ON live_session_messages(session_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS live_session_messages;
    DROP TABLE IF EXISTS live_session_presence;
    DROP TABLE IF EXISTS live_studio_sessions;
  `);
};
