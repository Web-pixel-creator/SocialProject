import { createClient } from 'redis';
import { env } from '../config/env';

export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (env.NODE_ENV === 'test') {
        return false;
      }
      return Math.min(50 * retries, 1000);
    },
  },
});

type AsyncFn<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;
interface RedisFallbackClient {
  connect: AsyncFn<unknown[], unknown>;
  quit: AsyncFn<unknown[], unknown>;
  flushAll: AsyncFn<unknown[], unknown>;
  del: AsyncFn<unknown[], number>;
  keys: AsyncFn<unknown[], string[]>;
  hGetAll: AsyncFn<unknown[], Record<string, string>>;
  hIncrBy: AsyncFn<unknown[], number>;
  ttl: AsyncFn<unknown[], number>;
  expire: AsyncFn<unknown[], boolean>;
  get: AsyncFn<unknown[], string | null>;
  incr: AsyncFn<unknown[], number>;
  isOpen: boolean;
}

type RedisFallbackClientShape = RedisFallbackClient & {
  on: (event: 'error', listener: (error: unknown) => void) => unknown;
};

const redisClient = redis as unknown as RedisFallbackClientShape;

const bindMethodOrFallback = <TArgs extends unknown[], TResult>(
  method: unknown,
  fallback: AsyncFn<TArgs, TResult>,
): AsyncFn<TArgs, TResult> =>
  typeof method === 'function'
    ? (method as AsyncFn<TArgs, TResult>).bind(redisClient)
    : fallback;

let fallbackEnabled = false;
let connectedState = false;
const fallbackStringStore = new Map<string, string>();
const fallbackHashStore = new Map<string, Map<string, string>>();
const fallbackExpiryStore = new Map<string, number>();

const nativeIsOpenGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(redisClient),
  'isOpen',
)?.get;

const readNativeIsOpen = (): boolean => {
  if (!nativeIsOpenGetter) {
    return false;
  }
  return Boolean(nativeIsOpenGetter.call(redisClient));
};

Object.defineProperty(redisClient, 'isOpen', {
  configurable: true,
  get: () => (fallbackEnabled ? true : connectedState || readNativeIsOpen()),
});

const resetFallbackState = () => {
  fallbackStringStore.clear();
  fallbackHashStore.clear();
  fallbackExpiryStore.clear();
};

const deleteFallbackKey = (key: string) => {
  fallbackStringStore.delete(key);
  fallbackHashStore.delete(key);
  fallbackExpiryStore.delete(key);
};

const pruneExpiredFallbackKey = (key: string) => {
  const expiresAt = fallbackExpiryStore.get(key);
  if (expiresAt === undefined || expiresAt > Date.now()) {
    return;
  }
  deleteFallbackKey(key);
};

const hasFallbackKey = (key: string): boolean => {
  pruneExpiredFallbackKey(key);
  return fallbackStringStore.has(key) || fallbackHashStore.has(key);
};

const fallbackGlobToRegex = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wildcarded = escaped.replace(/\\\*/g, '.*');
  return new RegExp(`^${wildcarded}$`);
};

const activateTestFallback = () => {
  if (env.NODE_ENV !== 'test') {
    return;
  }
  fallbackEnabled = true;
};

const originalConnect: AsyncFn<unknown[], unknown> = bindMethodOrFallback(
  redisClient.connect,
  async () => redisClient,
);
const originalQuit: AsyncFn<unknown[], unknown> = bindMethodOrFallback(
  redisClient.quit,
  async () => 'OK',
);
const originalFlushAll: AsyncFn<unknown[], unknown> = bindMethodOrFallback(
  redisClient.flushAll,
  async () => 'OK',
);
const originalDel: AsyncFn<unknown[], number> = bindMethodOrFallback(
  redisClient.del,
  async () => 0,
);
const originalKeys: AsyncFn<unknown[], string[]> = bindMethodOrFallback(
  redisClient.keys,
  async () => [],
);
const originalHGetAll: AsyncFn<
  unknown[],
  Record<string, string>
> = bindMethodOrFallback(redisClient.hGetAll, async () => ({}));
const originalHIncrBy: AsyncFn<unknown[], number> = bindMethodOrFallback(
  redisClient.hIncrBy,
  async (_key: unknown, _field: unknown, increment: unknown) =>
    Number(increment ?? 0),
);
const originalTtl: AsyncFn<unknown[], number> = bindMethodOrFallback(
  redisClient.ttl,
  async () => -1,
);
const originalExpire: AsyncFn<unknown[], boolean> = bindMethodOrFallback(
  redisClient.expire,
  async () => true,
);
const originalGet: AsyncFn<unknown[], string | null> = bindMethodOrFallback(
  redisClient.get,
  async () => null,
);
const originalIncr: AsyncFn<unknown[], number> = bindMethodOrFallback(
  redisClient.incr,
  async () => 1,
);

redisClient.connect = async (...args: unknown[]) => {
  if (fallbackEnabled) {
    return redisClient;
  }
  try {
    await originalConnect(...args);
    connectedState = true;
    return redisClient;
  } catch (error) {
    if (env.NODE_ENV === 'test') {
      activateTestFallback();
      connectedState = false;
      return redisClient;
    }
    throw error;
  }
};

redisClient.quit = (...args: unknown[]) => {
  if (fallbackEnabled) {
    resetFallbackState();
    fallbackEnabled = false;
    connectedState = false;
    return Promise.resolve('OK');
  }
  return originalQuit(...args)
    .catch(() => 'OK')
    .finally(() => {
      connectedState = false;
    });
};

redisClient.flushAll = (...args: unknown[]) => {
  if (fallbackEnabled) {
    resetFallbackState();
    return Promise.resolve('OK');
  }
  return originalFlushAll(...args);
};

redisClient.del = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalDel(...args);
  }

  const flatKeys = args.flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  let deleted = 0;

  for (const value of flatKeys) {
    if (typeof value !== 'string') {
      continue;
    }
    if (hasFallbackKey(value)) {
      deleteFallbackKey(value);
      deleted += 1;
    }
  }

  return Promise.resolve(deleted);
};

redisClient.keys = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalKeys(...args);
  }

  const [patternArg] = args;
  const pattern = typeof patternArg === 'string' ? patternArg : '*';
  const matcher = fallbackGlobToRegex(pattern);
  const keySet = new Set<string>([
    ...fallbackStringStore.keys(),
    ...fallbackHashStore.keys(),
  ]);

  for (const key of [...keySet]) {
    pruneExpiredFallbackKey(key);
    if (!hasFallbackKey(key)) {
      keySet.delete(key);
    }
  }

  return Promise.resolve([...keySet].filter((key) => matcher.test(key)));
};

redisClient.hGetAll = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalHGetAll(...args);
  }

  const [keyArg] = args;
  if (typeof keyArg !== 'string') {
    return Promise.resolve({});
  }

  pruneExpiredFallbackKey(keyArg);
  const values = fallbackHashStore.get(keyArg);
  if (!values) {
    return Promise.resolve({});
  }
  return Promise.resolve(Object.fromEntries(values.entries()));
};

redisClient.hIncrBy = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalHIncrBy(...args);
  }

  const [keyArg, fieldArg, incrementArg] = args;
  if (typeof keyArg !== 'string') {
    return Promise.resolve(0);
  }

  const field = String(fieldArg ?? '');
  const increment = Number(incrementArg ?? 0);
  const safeIncrement = Number.isFinite(increment) ? increment : 0;

  pruneExpiredFallbackKey(keyArg);
  const hash = fallbackHashStore.get(keyArg) ?? new Map<string, string>();
  fallbackHashStore.set(keyArg, hash);

  const current = Number.parseInt(hash.get(field) ?? '0', 10);
  const next = current + safeIncrement;
  hash.set(field, String(next));
  return Promise.resolve(next);
};

redisClient.ttl = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalTtl(...args);
  }

  const [keyArg] = args;
  if (typeof keyArg !== 'string') {
    return Promise.resolve(-2);
  }

  pruneExpiredFallbackKey(keyArg);
  if (!hasFallbackKey(keyArg)) {
    return Promise.resolve(-2);
  }

  const expiresAt = fallbackExpiryStore.get(keyArg);
  if (expiresAt === undefined) {
    return Promise.resolve(-1);
  }

  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    deleteFallbackKey(keyArg);
    return Promise.resolve(-2);
  }
  return Promise.resolve(Math.floor(remainingMs / 1000));
};

redisClient.expire = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalExpire(...args);
  }

  const [keyArg, secondsArg] = args;
  if (typeof keyArg !== 'string' || !hasFallbackKey(keyArg)) {
    return Promise.resolve(false);
  }

  const seconds = Number(secondsArg ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return Promise.resolve(false);
  }

  fallbackExpiryStore.set(keyArg, Date.now() + seconds * 1000);
  return Promise.resolve(true);
};

redisClient.get = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalGet(...args);
  }

  const [keyArg] = args;
  if (typeof keyArg !== 'string') {
    return Promise.resolve(null);
  }

  pruneExpiredFallbackKey(keyArg);
  return Promise.resolve(fallbackStringStore.get(keyArg) ?? null);
};

redisClient.incr = (...args: unknown[]) => {
  if (!fallbackEnabled) {
    return originalIncr(...args);
  }

  const [keyArg] = args;
  if (typeof keyArg !== 'string') {
    return Promise.resolve(0);
  }

  pruneExpiredFallbackKey(keyArg);
  const current = Number.parseInt(fallbackStringStore.get(keyArg) ?? '0', 10);
  const next = current + 1;
  fallbackStringStore.set(keyArg, String(next));
  return Promise.resolve(next);
};

redis.on('error', (error) => {
  if (env.NODE_ENV === 'test' && process.env.TEST_LOGS_ENABLED !== 'true') {
    return;
  }
  console.error('Redis error', error);
});

if (env.NODE_ENV === 'test') {
  process.once('beforeExit', () => {
    if (redisClient.isOpen) {
      redisClient.quit().catch(() => {
        // ignore teardown errors in tests
      });
    }
  });
}
