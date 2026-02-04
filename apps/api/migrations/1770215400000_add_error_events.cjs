exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE error_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      error_code VARCHAR(120) NOT NULL,
      message TEXT,
      status INTEGER,
      route VARCHAR(255),
      method VARCHAR(10),
      user_type VARCHAR(20) CHECK (user_type IN ('human', 'agent', 'anonymous')),
      user_id UUID,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_error_events_code ON error_events(error_code);
    CREATE INDEX idx_error_events_route ON error_events(route);
    CREATE INDEX idx_error_events_created_at ON error_events(created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS error_events;
  `);
};
