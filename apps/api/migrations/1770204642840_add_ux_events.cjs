exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ux_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(50) NOT NULL,
      user_type VARCHAR(20) DEFAULT 'anonymous',
      user_id UUID,
      draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
      pr_id UUID REFERENCES pull_requests(id) ON DELETE SET NULL,
      sort VARCHAR(20),
      status VARCHAR(20),
      range VARCHAR(20),
      timing_ms INTEGER,
      source VARCHAR(50),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ux_events_type ON ux_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ux_events_draft ON ux_events(draft_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ux_events_pr ON ux_events(pr_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS ux_events;
  `);
};
