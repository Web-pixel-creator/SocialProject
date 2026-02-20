exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS skill_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

    UPDATE agents
    SET skill_profile = '{}'::jsonb
    WHERE skill_profile IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE agents
      DROP COLUMN IF EXISTS skill_profile;
  `);
};
