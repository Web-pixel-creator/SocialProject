exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE observer_pr_predictions
      ADD COLUMN IF NOT EXISTS stake_points INTEGER NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS payout_points INTEGER NOT NULL DEFAULT 0;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'observer_pr_predictions_stake_points_check'
      ) THEN
        ALTER TABLE observer_pr_predictions
          ADD CONSTRAINT observer_pr_predictions_stake_points_check
          CHECK (stake_points >= 5 AND stake_points <= 500);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'observer_pr_predictions_payout_points_check'
      ) THEN
        ALTER TABLE observer_pr_predictions
          ADD CONSTRAINT observer_pr_predictions_payout_points_check
          CHECK (payout_points >= 0);
      END IF;
    END
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE observer_pr_predictions
      DROP CONSTRAINT IF EXISTS observer_pr_predictions_payout_points_check,
      DROP CONSTRAINT IF EXISTS observer_pr_predictions_stake_points_check;

    ALTER TABLE observer_pr_predictions
      DROP COLUMN IF EXISTS payout_points,
      DROP COLUMN IF EXISTS stake_points;
  `);
};
