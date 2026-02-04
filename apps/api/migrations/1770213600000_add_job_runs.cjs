exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE job_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_name VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
      started_at TIMESTAMP NOT NULL,
      finished_at TIMESTAMP NOT NULL,
      duration_ms INTEGER NOT NULL,
      error_message TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_job_runs_name ON job_runs(job_name);
    CREATE INDEX idx_job_runs_status ON job_runs(status);
    CREATE INDEX idx_job_runs_finished_at ON job_runs(finished_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS job_runs;
  `);
};
