import { db } from '../db/pool';
import { logger } from '../logging/logger';
import { EmbeddingBackfillServiceImpl } from '../services/search/embeddingBackfillService';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const [key, value] = arg.slice(2).split('=');
    config[key] = value ?? 'true';
  }
  return config;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const run = async () => {
  const args = parseArgs();
  const batchSize = clamp(Number(args.batchSize ?? 200), 1, 1000);
  const maxBatches = clamp(Number(args.maxBatches ?? 10), 1, 100);

  const service = new EmbeddingBackfillServiceImpl(db);
  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const result = await service.backfillDraftEmbeddings(batchSize);
    processed += result.processed;
    inserted += result.inserted;
    skipped += result.skipped;
    batches += 1;
    if (result.processed < batchSize) {
      break;
    }
  }

  logger.info({ batches, batchSize, processed, inserted, skipped }, 'Embedding backfill run complete');
  await db.end();
};

run().catch(async (error) => {
  logger.error({ err: error }, 'Embedding backfill failed');
  await db.end();
  process.exit(1);
});
