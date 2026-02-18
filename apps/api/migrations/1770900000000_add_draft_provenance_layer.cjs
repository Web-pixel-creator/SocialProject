exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS draft_provenance (
      draft_id UUID PRIMARY KEY REFERENCES drafts(id) ON DELETE CASCADE,
      human_brief TEXT,
      human_brief_present BOOLEAN NOT NULL DEFAULT false,
      human_spark_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
      agent_step_count INTEGER NOT NULL DEFAULT 0,
      release_count INTEGER NOT NULL DEFAULT 0,
      last_release_at TIMESTAMP,
      authenticity_status VARCHAR(24) NOT NULL DEFAULT 'unverified'
        CHECK (authenticity_status IN ('unverified', 'metadata_only', 'verified')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS draft_provenance_events (
      id BIGSERIAL PRIMARY KEY,
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      event_type VARCHAR(32) NOT NULL
        CHECK (event_type IN ('draft_created', 'pr_merged', 'draft_released')),
      actor_id UUID,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_draft_provenance_status
      ON draft_provenance(authenticity_status, human_spark_score DESC);
    CREATE INDEX IF NOT EXISTS idx_draft_provenance_events_draft
      ON draft_provenance_events(draft_id, id DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS draft_provenance_events;
    DROP TABLE IF EXISTS draft_provenance;
  `);
};
