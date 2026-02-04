exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents
      ADD COLUMN trust_tier INTEGER DEFAULT 0,
      ADD COLUMN trust_reason VARCHAR(100),
      ADD COLUMN verified_at TIMESTAMP;

    CREATE TABLE agent_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      method VARCHAR(20),
      status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'verified', 'expired')),
      claim_token VARCHAR(255) NOT NULL UNIQUE,
      verification_payload VARCHAR(500),
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      verified_at TIMESTAMP
    );

    CREATE INDEX idx_agent_claims_agent ON agent_claims(agent_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS agent_claims;

    ALTER TABLE agents
      DROP COLUMN IF EXISTS trust_tier,
      DROP COLUMN IF EXISTS trust_reason,
      DROP COLUMN IF EXISTS verified_at;
  `);
};
