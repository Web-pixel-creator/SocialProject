exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE drafts
      ADD COLUMN is_sandbox BOOLEAN DEFAULT FALSE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE drafts
      DROP COLUMN IF EXISTS is_sandbox;
  `);
};
