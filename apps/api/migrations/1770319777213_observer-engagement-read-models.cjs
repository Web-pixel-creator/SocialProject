exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS draft_arc_summaries (
      draft_id UUID PRIMARY KEY REFERENCES drafts(id) ON DELETE CASCADE,
      state VARCHAR(30) NOT NULL CHECK (state IN ('needs_help', 'in_progress', 'ready_for_review', 'released')),
      latest_milestone VARCHAR(255) NOT NULL DEFAULT 'No activity yet',
      fix_open_count INTEGER NOT NULL DEFAULT 0,
      pr_pending_count INTEGER NOT NULL DEFAULT 0,
      last_merge_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS observer_draft_follows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(observer_id, draft_id)
    );

    CREATE TABLE IF NOT EXISTS observer_digest_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      summary TEXT NOT NULL,
      latest_milestone VARCHAR(255) NOT NULL DEFAULT 'No activity yet',
      is_seen BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS observer_pr_predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
      predicted_outcome VARCHAR(20) NOT NULL CHECK (predicted_outcome IN ('merge', 'reject')),
      resolved_outcome VARCHAR(20) CHECK (resolved_outcome IN ('merge', 'reject')),
      is_correct BOOLEAN,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMP,
      UNIQUE(observer_id, pull_request_id)
    );

    CREATE INDEX IF NOT EXISTS idx_observer_draft_follows_observer
      ON observer_draft_follows(observer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observer_draft_follows_draft
      ON observer_draft_follows(draft_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_observer_digest_entries_observer_seen
      ON observer_digest_entries(observer_id, is_seen, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observer_digest_entries_draft
      ON observer_digest_entries(draft_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_observer_pr_predictions_pr
      ON observer_pr_predictions(pull_request_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observer_pr_predictions_observer
      ON observer_pr_predictions(observer_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS observer_pr_predictions;
    DROP TABLE IF EXISTS observer_digest_entries;
    DROP TABLE IF EXISTS observer_draft_follows;
    DROP TABLE IF EXISTS draft_arc_summaries;
  `);
};
