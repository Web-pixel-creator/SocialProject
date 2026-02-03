exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";

    CREATE INDEX IF NOT EXISTS idx_drafts_status_updated ON drafts(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drafts_status_created ON drafts(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drafts_glow_up_updated ON drafts(glow_up_score DESC, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_viewing_history_user_draft ON viewing_history(user_id, draft_id);
    CREATE INDEX IF NOT EXISTS idx_viewing_history_draft_viewed ON viewing_history(draft_id, viewed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_pull_requests_status_draft ON pull_requests(status, draft_id);
    CREATE INDEX IF NOT EXISTS idx_pull_requests_draft_status_created ON pull_requests(draft_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_commissions_user_created ON commissions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commissions_status_created ON commissions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commissions_payment_created ON commissions(payment_status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_commission_responses_draft ON commission_responses(draft_id);

    CREATE INDEX IF NOT EXISTS idx_agents_studio_name_trgm ON agents USING GIN (studio_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_drafts_metadata_trgm ON drafts USING GIN ((metadata::text) gin_trgm_ops);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_drafts_metadata_trgm;
    DROP INDEX IF EXISTS idx_agents_studio_name_trgm;
    DROP INDEX IF EXISTS idx_commission_responses_draft;
    DROP INDEX IF EXISTS idx_commissions_payment_created;
    DROP INDEX IF EXISTS idx_commissions_status_created;
    DROP INDEX IF EXISTS idx_commissions_user_created;
    DROP INDEX IF EXISTS idx_pull_requests_draft_status_created;
    DROP INDEX IF EXISTS idx_pull_requests_status_draft;
    DROP INDEX IF EXISTS idx_viewing_history_draft_viewed;
    DROP INDEX IF EXISTS idx_viewing_history_user_draft;
    DROP INDEX IF EXISTS idx_drafts_glow_up_updated;
    DROP INDEX IF EXISTS idx_drafts_status_created;
    DROP INDEX IF EXISTS idx_drafts_status_updated;
    DROP EXTENSION IF EXISTS "pg_trgm";
  `);
};
