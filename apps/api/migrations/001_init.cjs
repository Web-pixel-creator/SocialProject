exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      oauth_provider VARCHAR(50),
      oauth_id VARCHAR(255),
      terms_version VARCHAR(20),
      terms_accepted_at TIMESTAMP,
      privacy_version VARCHAR(20),
      privacy_accepted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP,
      anonymized_at TIMESTAMP,
      UNIQUE(oauth_provider, oauth_id)
    );

    CREATE TABLE agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      studio_name VARCHAR(255) UNIQUE NOT NULL,
      personality TEXT NOT NULL,
      api_key_hash VARCHAR(255) NOT NULL,
      impact DECIMAL(10,2) DEFAULT 0,
      signal DECIMAL(10,2) DEFAULT 50,
      total_prs INTEGER DEFAULT 0,
      merged_prs INTEGER DEFAULT 0,
      rejected_prs INTEGER DEFAULT 0,
      webhook_url VARCHAR(500),
      notification_prefs JSONB DEFAULT '{"enableFixRequests":true,"enablePullRequests":true,"enableDecisions":true,"enableFeatured":true}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_agents_impact ON agents(impact DESC);
    CREATE INDEX idx_agents_signal ON agents(signal DESC);

    CREATE TABLE drafts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      author_id UUID NOT NULL REFERENCES agents(id),
      current_version INTEGER DEFAULT 1,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'release')),
      glow_up_score DECIMAL(10,2) DEFAULT 0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_drafts_author ON drafts(author_id);
    CREATE INDEX idx_drafts_status ON drafts(status);
    CREATE INDEX idx_drafts_glow_up ON drafts(glow_up_score DESC);
    CREATE INDEX idx_drafts_updated ON drafts(updated_at DESC);

    CREATE TABLE versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      image_url VARCHAR(500) NOT NULL,
      thumbnail_url VARCHAR(500) NOT NULL,
      created_by UUID NOT NULL REFERENCES agents(id),
      pull_request_id UUID,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(draft_id, version_number)
    );

    CREATE INDEX idx_versions_draft ON versions(draft_id, version_number);

    CREATE TABLE fix_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      critic_id UUID NOT NULL REFERENCES agents(id),
      category VARCHAR(50) NOT NULL CHECK (category IN ('Focus', 'Cohesion', 'Readability', 'Composition', 'Color/Light', 'Story/Intent', 'Technical')),
      description TEXT NOT NULL,
      coordinates JSONB,
      target_version INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_fix_requests_draft ON fix_requests(draft_id, created_at DESC);
    CREATE INDEX idx_fix_requests_critic ON fix_requests(critic_id);

    CREATE TABLE pull_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      maker_id UUID NOT NULL REFERENCES agents(id),
      proposed_version INTEGER NOT NULL,
      description TEXT NOT NULL,
      severity VARCHAR(10) NOT NULL CHECK (severity IN ('major', 'minor')),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'rejected', 'changes_requested')),
      addressed_fix_requests JSONB DEFAULT '[]',
      author_feedback TEXT,
      judge_verdict JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      decided_at TIMESTAMP
    );

    CREATE INDEX idx_pull_requests_draft ON pull_requests(draft_id, created_at DESC);
    CREATE INDEX idx_pull_requests_maker ON pull_requests(maker_id);
    CREATE INDEX idx_pull_requests_status ON pull_requests(status);

    ALTER TABLE versions ADD CONSTRAINT fk_versions_pr
      FOREIGN KEY (pull_request_id) REFERENCES pull_requests(id);

    CREATE TABLE viewing_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      viewed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_viewing_history_user ON viewing_history(user_id, viewed_at DESC);
    CREATE INDEX idx_viewing_history_draft ON viewing_history(draft_id);

    CREATE TABLE commissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      description TEXT NOT NULL,
      reference_images JSONB DEFAULT '[]',
      reward_amount DECIMAL(10,2),
      currency VARCHAR(10) DEFAULT 'USD',
      payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'escrowed', 'paid_out', 'refunded', 'failed')),
      payment_provider VARCHAR(50),
      payment_intent_id VARCHAR(255),
      payout_id VARCHAR(255),
      escrowed_at TIMESTAMP,
      paid_out_at TIMESTAMP,
      refunded_at TIMESTAMP,
      winner_draft_id UUID REFERENCES drafts(id),
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE INDEX idx_commissions_status ON commissions(status, created_at DESC);
    CREATE INDEX idx_commissions_payment_status ON commissions(payment_status);

    CREATE TABLE commission_responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
      draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(commission_id, draft_id)
    );

    CREATE INDEX idx_commission_responses_commission ON commission_responses(commission_id);

    CREATE TABLE payment_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider VARCHAR(50) NOT NULL,
      provider_event_id VARCHAR(255) UNIQUE NOT NULL,
      commission_id UUID REFERENCES commissions(id),
      event_type VARCHAR(100) NOT NULL,
      received_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_payment_events_commission ON payment_events(commission_id);

    CREATE TABLE data_exports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
      export_url VARCHAR(500),
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_data_exports_user ON data_exports(user_id, created_at DESC);

    CREATE TABLE deletion_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
      requested_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE INDEX idx_deletion_requests_user ON deletion_requests(user_id, requested_at DESC);

    CREATE TABLE forks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      original_draft_id UUID NOT NULL REFERENCES drafts(id),
      forked_draft_id UUID NOT NULL REFERENCES drafts(id),
      rejected_pr_id UUID NOT NULL REFERENCES pull_requests(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_forks_original ON forks(original_draft_id);
    CREATE INDEX idx_forks_forked ON forks(forked_draft_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS forks;
    DROP TABLE IF EXISTS deletion_requests;
    DROP TABLE IF EXISTS data_exports;
    DROP TABLE IF EXISTS payment_events;
    DROP TABLE IF EXISTS commission_responses;
    DROP TABLE IF EXISTS commissions;
    DROP TABLE IF EXISTS viewing_history;
    DROP TABLE IF EXISTS pull_requests;
    DROP TABLE IF EXISTS fix_requests;
    DROP TABLE IF EXISTS versions;
    DROP TABLE IF EXISTS drafts;
    DROP TABLE IF EXISTS agents;
    DROP TABLE IF EXISTS users;
  `);
};
