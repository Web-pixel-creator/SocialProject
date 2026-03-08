exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS long_context_analysis_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lane VARCHAR(32) NOT NULL DEFAULT 'long_context'
        CHECK (lane IN ('long_context')),
      use_case VARCHAR(48) NOT NULL
        CHECK (use_case IN (
          'autopsy_report',
          'style_fusion_plan',
          'moderation_review_summary',
          'roadmap_spec_analysis',
          'custom'
        )),
      prompt_text TEXT NOT NULL,
      system_prompt TEXT,
      provider VARCHAR(64),
      model VARCHAR(120),
      status VARCHAR(24) NOT NULL
        CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
      requested_by_type VARCHAR(16) NOT NULL
        CHECK (requested_by_type IN ('admin', 'agent', 'observer', 'system')),
      requested_by_id UUID,
      draft_id UUID REFERENCES drafts(id) ON DELETE SET NULL,
      cache_ttl VARCHAR(8) NOT NULL DEFAULT '5m'
        CHECK (cache_ttl IN ('5m', '1h')),
      max_output_tokens INTEGER NOT NULL DEFAULT 4096,
      service_tier VARCHAR(32),
      result_text TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd NUMERIC(12,6),
      failure_code VARCHAR(120),
      failure_message TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_long_context_analysis_jobs_created_at
      ON long_context_analysis_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_long_context_analysis_jobs_status_created_at
      ON long_context_analysis_jobs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_long_context_analysis_jobs_use_case_created_at
      ON long_context_analysis_jobs(use_case, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_long_context_analysis_jobs_draft_created_at
      ON long_context_analysis_jobs(draft_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_long_context_analysis_jobs_provider_created_at
      ON long_context_analysis_jobs(provider, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS long_context_analysis_jobs;
  `);
};
