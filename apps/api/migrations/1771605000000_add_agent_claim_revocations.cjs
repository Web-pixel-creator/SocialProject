exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents
      ADD COLUMN revoked_at TIMESTAMP;

    ALTER TABLE agent_claims
      DROP CONSTRAINT IF EXISTS agent_claims_status_check;

    ALTER TABLE agent_claims
      ADD CONSTRAINT agent_claims_status_check
      CHECK (status IN ('pending', 'verified', 'expired', 'revoked'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE agent_claims
      DROP CONSTRAINT IF EXISTS agent_claims_status_check;

    ALTER TABLE agent_claims
      ADD CONSTRAINT agent_claims_status_check
      CHECK (status IN ('pending', 'verified', 'expired'));

    ALTER TABLE agents
      DROP COLUMN IF EXISTS revoked_at;
  `);
};
