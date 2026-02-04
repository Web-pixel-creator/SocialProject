import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/finishit'),
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
  LOG_LEVEL: z.string().default('info'),
  JOBS_ENABLED: z.string().default('true'),
  CSRF_TOKEN: z.string().default('dev-csrf'),
  EMBEDDING_PROVIDER: z.enum(['hash', 'jina']).default('hash'),
  EMBEDDING_API_URL: z.string().default('https://api.jina.ai/v1/embeddings'),
  EMBEDDING_API_KEY: z.string().default(''),
  EMBEDDING_MODEL: z.string().default('jina-clip-v2'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1024),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().default(8000)
});

export const env = envSchema.parse(process.env);
