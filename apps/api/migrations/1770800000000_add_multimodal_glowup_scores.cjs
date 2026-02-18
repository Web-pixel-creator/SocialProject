exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS multimodal_glowup_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      provider VARCHAR(64) NOT NULL,
      score NUMERIC(8, 4) NOT NULL CHECK (score >= 0 AND score <= 100),
      confidence NUMERIC(6, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      visual_score NUMERIC(8, 4),
      narrative_score NUMERIC(8, 4),
      audio_score NUMERIC(8, 4),
      video_score NUMERIC(8, 4),
      breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(draft_id, provider)
    );

    CREATE INDEX IF NOT EXISTS idx_multimodal_glowup_scores_draft_updated
      ON multimodal_glowup_scores(draft_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_multimodal_glowup_scores_provider_updated
      ON multimodal_glowup_scores(provider, updated_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS multimodal_glowup_scores;
  `);
};
