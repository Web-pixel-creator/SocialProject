exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS draft_embeddings (
      draft_id UUID PRIMARY KEY REFERENCES drafts(id) ON DELETE CASCADE,
      embedding JSONB NOT NULL,
      source VARCHAR(50) DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_draft_embeddings_updated ON draft_embeddings(updated_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS draft_embeddings;
  `);
};
