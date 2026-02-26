import 'dotenv/config';
import { z } from 'zod';

const defaultLogLevel =
  process.env.NODE_ENV === 'test' && process.env.TEST_LOGS_ENABLED !== 'true'
    ? 'silent'
    : 'info';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    .default('postgres://postgres:postgres@localhost:5432/finishit'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('finishit'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().default('dev-secret'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  TERMS_VERSION: z.string().default('v1'),
  PRIVACY_VERSION: z.string().default('v1'),
  LOG_LEVEL: z.string().default(defaultLogLevel),
  JOBS_ENABLED: z.string().default('true'),
  CSRF_TOKEN: z.string().default('dev-csrf'),
  EMBEDDING_PROVIDER: z.enum(['hash', 'jina']).default('hash'),
  EMBEDDING_API_URL: z.string().default('https://api.jina.ai/v1/embeddings'),
  EMBEDDING_API_KEY: z.string().default(''),
  EMBEDDING_MODEL: z.string().default('jina-clip-v2'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1024),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().default(8000),
  AGENT_ORCHESTRATION_ENABLED: z.string().default('true'),
  ADMIN_API_TOKEN: z.string().default(''),
  ENABLE_DEMO_FLOW: z.string().default('false'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_REALTIME_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),
  OPENAI_REALTIME_VOICE: z
    .enum([
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'sage',
      'shimmer',
      'verse',
      'marin',
      'cedar',
    ])
    .default('marin'),
  OPENAI_REALTIME_TIMEOUT_MS: z.coerce.number().default(12_000),
  AGENT_GATEWAY_WEBHOOK_SECRET: z.string().default('dev-agent-gateway-secret'),
  AGENT_GATEWAY_WEBHOOK_SECRET_PREVIOUS: z.string().default(''),
  AGENT_GATEWAY_INGEST_MAX_TIMESTAMP_SKEW_SEC: z.coerce.number().default(300),
  AGENT_GATEWAY_INGEST_IDEMPOTENCY_TTL_SEC: z.coerce.number().default(86_400),
  AGENT_GATEWAY_INGEST_ALLOWED_CONNECTORS: z.string().default(''),
  AGENT_GATEWAY_INGEST_CONNECTOR_SECRETS: z.string().default(''),
  AGENT_GATEWAY_INGEST_REQUIRE_CONNECTOR_SECRET: z
    .enum(['true', 'false'])
    .default('false'),
  HEAVY_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  HEAVY_RATE_LIMIT_MAX: z.coerce.number().default(30),
  SEARCH_RELEVANCE_WEIGHT_KEYWORD: z.coerce.number().default(0.6),
  SEARCH_RELEVANCE_WEIGHT_GLOWUP: z.coerce.number().default(0.3),
  SEARCH_RELEVANCE_WEIGHT_RECENCY: z.coerce.number().default(0.1),
  SEARCH_RELEVANCE_WEIGHT_STUDIO_KEYWORD: z.coerce.number().default(0.7),
  SEARCH_RELEVANCE_WEIGHT_STUDIO_IMPACT: z.coerce.number().default(0.3),
  HOT_NOW_W_RECENT: z.coerce.number().default(0.4),
  HOT_NOW_W_FIX: z.coerce.number().default(0.2),
  HOT_NOW_W_PENDING: z.coerce.number().default(0.2),
  HOT_NOW_W_DECISIONS: z.coerce.number().default(0.1),
  HOT_NOW_W_GLOWUP: z.coerce.number().default(0.1),
  HOT_NOW_DECAY_TAU_HOURS: z.coerce.number().default(12),
});

export const env = envSchema.parse(process.env);

const assertProductionSecrets = () => {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const errors: string[] = [];
  if (
    !env.JWT_SECRET ||
    env.JWT_SECRET === 'dev-secret' ||
    env.JWT_SECRET.length < 16
  ) {
    errors.push('JWT_SECRET must be set to a strong value in production.');
  }
  if (
    !env.CSRF_TOKEN ||
    env.CSRF_TOKEN === 'dev-csrf' ||
    env.CSRF_TOKEN.length < 16
  ) {
    errors.push('CSRF_TOKEN must be set to a strong value in production.');
  }
  if (!env.ADMIN_API_TOKEN || env.ADMIN_API_TOKEN === 'change-me') {
    errors.push('ADMIN_API_TOKEN must be set in production.');
  }
  if (
    !env.AGENT_GATEWAY_WEBHOOK_SECRET ||
    env.AGENT_GATEWAY_WEBHOOK_SECRET === 'dev-agent-gateway-secret' ||
    env.AGENT_GATEWAY_WEBHOOK_SECRET.length < 16
  ) {
    errors.push(
      'AGENT_GATEWAY_WEBHOOK_SECRET must be set to a strong value in production.',
    );
  }
  if (
    env.AGENT_GATEWAY_INGEST_REQUIRE_CONNECTOR_SECRET === 'true' &&
    !env.AGENT_GATEWAY_INGEST_CONNECTOR_SECRETS.trim()
  ) {
    errors.push(
      'AGENT_GATEWAY_INGEST_CONNECTOR_SECRETS must be set when AGENT_GATEWAY_INGEST_REQUIRE_CONNECTOR_SECRET=true.',
    );
  }
  if (env.EMBEDDING_PROVIDER === 'jina' && !env.EMBEDDING_API_KEY) {
    errors.push('EMBEDDING_API_KEY must be set when EMBEDDING_PROVIDER=jina.');
  }
  if (errors.length > 0) {
    throw new Error(
      `Invalid production configuration:\n- ${errors.join('\n- ')}`,
    );
  }
};

assertProductionSecrets();
