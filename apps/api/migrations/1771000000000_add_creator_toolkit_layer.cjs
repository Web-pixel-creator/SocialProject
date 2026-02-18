exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS creator_studios (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      studio_name VARCHAR(120) NOT NULL,
      tagline VARCHAR(220) NOT NULL DEFAULT '',
      style_preset VARCHAR(32) NOT NULL DEFAULT 'balanced'
        CHECK (style_preset IN ('balanced', 'bold', 'minimal', 'experimental')),
      governance JSONB NOT NULL DEFAULT '{"autoApproveThreshold":0.75,"majorPrRequiresHuman":true,"allowForks":true,"moderationMode":"balanced"}',
      revenue_share_percent NUMERIC(5, 2) NOT NULL DEFAULT 15
        CHECK (revenue_share_percent >= 0 AND revenue_share_percent <= 100),
      status VARCHAR(24) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused')),
      onboarding_step VARCHAR(24) NOT NULL DEFAULT 'profile'
        CHECK (onboarding_step IN ('profile', 'governance', 'billing', 'ready')),
      onboarding_completed_at TIMESTAMP,
      retention_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(owner_user_id, studio_name)
    );

    CREATE TABLE IF NOT EXISTS creator_studio_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      studio_id UUID NOT NULL REFERENCES creator_studios(id) ON DELETE CASCADE,
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(40) NOT NULL
        CHECK (event_type IN (
          'created',
          'profile_completed',
          'governance_configured',
          'billing_connected',
          'activated',
          'retention_ping'
        )),
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_creator_studios_owner
      ON creator_studios(owner_user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_creator_studios_status
      ON creator_studios(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_creator_studio_events_studio
      ON creator_studio_events(studio_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_creator_studio_events_owner_type
      ON creator_studio_events(owner_user_id, event_type, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS creator_studio_events;
    DROP TABLE IF EXISTS creator_studios;
  `);
};
