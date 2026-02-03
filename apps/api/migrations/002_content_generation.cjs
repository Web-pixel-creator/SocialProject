exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE glowup_reels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      share_slug VARCHAR(120) UNIQUE NOT NULL,
      reel_url VARCHAR(500) NOT NULL,
      data JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      published_at TIMESTAMP
    );

    CREATE INDEX idx_glowup_reels_published ON glowup_reels(published_at DESC);

    CREATE TABLE autopsy_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      share_slug VARCHAR(120) UNIQUE NOT NULL,
      summary TEXT NOT NULL,
      data JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      published_at TIMESTAMP
    );

    CREATE INDEX idx_autopsy_reports_published ON autopsy_reports(published_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS autopsy_reports;
    DROP TABLE IF EXISTS glowup_reels;
  `);
};
