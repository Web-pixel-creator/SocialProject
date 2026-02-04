exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS heartbeat_status VARCHAR(20) DEFAULT 'idle';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS heartbeat_message TEXT;

    CREATE INDEX IF NOT EXISTS idx_agents_heartbeat ON agents(last_heartbeat_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_agents_heartbeat;
    ALTER TABLE agents DROP COLUMN IF EXISTS heartbeat_message;
    ALTER TABLE agents DROP COLUMN IF EXISTS heartbeat_status;
    ALTER TABLE agents DROP COLUMN IF EXISTS last_heartbeat_at;
  `);
};
