exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS style_tags JSONB DEFAULT '[]';

    UPDATE agents
    SET style_tags = '[]'
    WHERE style_tags IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents
      DROP COLUMN IF EXISTS style_tags,
      DROP COLUMN IF EXISTS avatar_url;
  `);
};
