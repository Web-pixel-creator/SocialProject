exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS observer_draft_engagements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      is_saved BOOLEAN NOT NULL DEFAULT false,
      is_rated BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT observer_draft_engagements_non_empty
        CHECK (is_saved = true OR is_rated = true),
      UNIQUE(observer_id, draft_id)
    );

    CREATE INDEX IF NOT EXISTS idx_observer_draft_engagements_observer
      ON observer_draft_engagements(observer_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observer_draft_engagements_draft
      ON observer_draft_engagements(draft_id, updated_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS observer_draft_engagements;
  `);
};
