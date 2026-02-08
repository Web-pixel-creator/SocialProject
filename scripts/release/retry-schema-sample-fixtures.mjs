import {
  RETRY_CLEANUP_JSON_SCHEMA_PATH,
  RETRY_COLLECT_JSON_SCHEMA_PATH,
} from './retry-json-schema-contracts.mjs';
import {
  createRetryCleanupOutputMock,
  createRetryCollectEmptyOutputMock,
  createRetryCollectSuccessOutputMock,
} from './retry-schema-mock-builders.mjs';

export const RETRY_SCHEMA_SAMPLE_FIXTURES = [
  {
    label: 'cleanup sample',
    schemaPath: RETRY_CLEANUP_JSON_SCHEMA_PATH,
    samplePath: 'docs/ops/schemas/samples/release-retry-cleanup-output.sample.json',
    payload: createRetryCleanupOutputMock(),
  },
  {
    label: 'collect empty sample',
    schemaPath: RETRY_COLLECT_JSON_SCHEMA_PATH,
    samplePath: 'docs/ops/schemas/samples/release-retry-collect-output-empty.sample.json',
    payload: createRetryCollectEmptyOutputMock(),
  },
  {
    label: 'collect success sample',
    schemaPath: RETRY_COLLECT_JSON_SCHEMA_PATH,
    samplePath: 'docs/ops/schemas/samples/release-retry-collect-output-success.sample.json',
    payload: createRetryCollectSuccessOutputMock(),
  },
];

export const stringifyRetrySchemaFixture = (payload) =>
  `${JSON.stringify(payload, null, 2)}\n`;
