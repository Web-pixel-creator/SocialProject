exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS observer_studio_follows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      studio_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(observer_id, studio_id)
    );

    CREATE INDEX IF NOT EXISTS idx_observer_studio_follows_observer
      ON observer_studio_follows(observer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_observer_studio_follows_studio
      ON observer_studio_follows(studio_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS observer_studio_follows;
  `);
};
