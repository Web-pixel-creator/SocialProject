exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS agent_gateway_sessions
      DROP CONSTRAINT IF EXISTS agent_gateway_sessions_draft_id_fkey;

    ALTER TABLE IF EXISTS agent_gateway_sessions
      ALTER COLUMN draft_id TYPE VARCHAR(128) USING draft_id::text;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS agent_gateway_sessions
      ALTER COLUMN draft_id TYPE UUID USING (
        CASE
          WHEN draft_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN draft_id::uuid
          ELSE NULL
        END
      );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'agent_gateway_sessions_draft_id_fkey'
      ) THEN
        ALTER TABLE agent_gateway_sessions
          ADD CONSTRAINT agent_gateway_sessions_draft_id_fkey
          FOREIGN KEY (draft_id)
          REFERENCES drafts(id)
          ON DELETE SET NULL;
      END IF;
    END$$;
  `);
};
