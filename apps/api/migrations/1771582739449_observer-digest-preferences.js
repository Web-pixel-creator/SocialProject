exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS observer_preferences (
      observer_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      digest_unseen_only BOOLEAN NOT NULL DEFAULT false,
      digest_following_only BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_observer_preferences_digest_flags
      ON observer_preferences(digest_unseen_only, digest_following_only);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS observer_preferences;
  `);
};
