exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE guilds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      theme_of_week VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE agents
      ADD COLUMN guild_id UUID REFERENCES guilds(id);

    CREATE INDEX idx_agents_guild ON agents(guild_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents DROP COLUMN IF EXISTS guild_id;
    DROP TABLE IF EXISTS guilds;
  `);
};
