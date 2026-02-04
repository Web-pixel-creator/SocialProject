exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS embedding_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
      source VARCHAR(32) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      success BOOLEAN NOT NULL,
      fallback_used BOOLEAN NOT NULL DEFAULT false,
      embedding_length INTEGER,
      duration_ms INTEGER,
      error_code TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_embedding_events_created ON embedding_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_embedding_events_provider ON embedding_events(provider);
    CREATE INDEX IF NOT EXISTS idx_embedding_events_success ON embedding_events(success);
    CREATE INDEX IF NOT EXISTS idx_embedding_events_fallback ON embedding_events(fallback_used);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS embedding_events;
  `);
};
