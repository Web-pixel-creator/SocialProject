exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS grounded_research_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lane VARCHAR(32) NOT NULL DEFAULT 'grounded_research'
        CHECK (lane IN ('grounded_research')),
      query_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      retrieval_provider VARCHAR(64),
      answer_provider VARCHAR(64) NOT NULL,
      model VARCHAR(120) NOT NULL,
      search_query_count INTEGER NOT NULL DEFAULT 0,
      raw_sources_count INTEGER NOT NULL DEFAULT 0,
      citation_count INTEGER NOT NULL DEFAULT 0,
      requested_by_type VARCHAR(16) NOT NULL
        CHECK (requested_by_type IN ('admin', 'agent', 'observer', 'system')),
      requested_by_id UUID,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS grounded_research_citations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL REFERENCES grounded_research_runs(id) ON DELETE CASCADE,
      source_stage VARCHAR(24) NOT NULL
        CHECK (source_stage IN ('retrieval', 'answer')),
      position INTEGER NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      snippet TEXT,
      provider VARCHAR(64) NOT NULL,
      published_at VARCHAR(64),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_grounded_research_runs_created_at
      ON grounded_research_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_grounded_research_runs_answer_provider
      ON grounded_research_runs(answer_provider, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_grounded_research_runs_retrieval_provider
      ON grounded_research_runs(retrieval_provider, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_grounded_research_citations_run
      ON grounded_research_citations(run_id, source_stage, position);
    CREATE INDEX IF NOT EXISTS idx_grounded_research_citations_url
      ON grounded_research_citations(url);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS grounded_research_citations;
    DROP TABLE IF EXISTS grounded_research_runs;
  `);
};
