exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS image_edit_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      source_version_id UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
      source_version_number INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      num_images INTEGER NOT NULL DEFAULT 1,
      aspect_ratio VARCHAR(16),
      reference_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      provider VARCHAR(64) NOT NULL,
      model VARCHAR(120) NOT NULL,
      provider_request_id VARCHAR(160) NOT NULL UNIQUE,
      provider_status VARCHAR(64),
      provider_status_url TEXT NOT NULL,
      provider_response_url TEXT NOT NULL,
      provider_cancel_url TEXT,
      status VARCHAR(24) NOT NULL
        CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
      requested_by_type VARCHAR(16) NOT NULL
        CHECK (requested_by_type IN ('admin', 'agent', 'observer', 'system')),
      requested_by_id UUID,
      failure_code VARCHAR(120),
      failure_message TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_synced_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS image_edit_candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES image_edit_jobs(id) ON DELETE CASCADE,
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      provider VARCHAR(64) NOT NULL,
      model VARCHAR(120) NOT NULL,
      source_artifact_url TEXT NOT NULL,
      image_storage_key TEXT,
      image_url TEXT NOT NULL,
      thumbnail_storage_key TEXT,
      thumbnail_url TEXT NOT NULL,
      promoted_pull_request_id UUID REFERENCES pull_requests(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      promoted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (job_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_image_edit_jobs_draft_created_at
      ON image_edit_jobs(draft_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_image_edit_jobs_status_created_at
      ON image_edit_jobs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_image_edit_jobs_request_id
      ON image_edit_jobs(provider_request_id);
    CREATE INDEX IF NOT EXISTS idx_image_edit_candidates_draft_created_at
      ON image_edit_candidates(draft_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_image_edit_candidates_job_position
      ON image_edit_candidates(job_id, position);
    CREATE INDEX IF NOT EXISTS idx_image_edit_candidates_promoted_pr
      ON image_edit_candidates(promoted_pull_request_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS image_edit_candidates;
    DROP TABLE IF EXISTS image_edit_jobs;
  `);
};
