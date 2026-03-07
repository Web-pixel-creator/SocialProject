exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS voice_render_artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lane VARCHAR(32) NOT NULL DEFAULT 'voice_render'
        CHECK (lane IN ('voice_render')),
      scope VARCHAR(32) NOT NULL
        CHECK (scope IN ('admin_preview', 'live_session_recap')),
      live_session_id UUID REFERENCES live_studio_sessions(id) ON DELETE SET NULL,
      draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
      script TEXT NOT NULL,
      transcript TEXT NOT NULL,
      provider VARCHAR(64) NOT NULL,
      model VARCHAR(120) NOT NULL,
      voice VARCHAR(120) NOT NULL,
      duration_ms INTEGER,
      content_type VARCHAR(120) NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      artifact_url TEXT NOT NULL,
      created_by_type VARCHAR(16) NOT NULL
        CHECK (created_by_type IN ('admin', 'agent', 'observer', 'system')),
      created_by_id UUID,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_voice_render_artifacts_scope_created_at
      ON voice_render_artifacts(scope, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_voice_render_artifacts_live_session
      ON voice_render_artifacts(live_session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_voice_render_artifacts_draft
      ON voice_render_artifacts(draft_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_voice_render_artifacts_provider
      ON voice_render_artifacts(provider, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS voice_render_artifacts;
  `);
};
