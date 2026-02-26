import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env';
import { db } from '../db/pool';
import { computeHeavyRateLimiter } from '../middleware/security';
import { redis } from '../redis/client';
import { agentGatewayAdapterService } from '../services/agentGatewayAdapter/agentGatewayAdapterService';
import type { AgentGatewayAdapterName } from '../services/agentGatewayAdapter/types';
import { ServiceError } from '../services/common/errors';

const router = Router();

const ADAPTER_NAMES = ['web', 'live_session', 'external_webhook'] as const;
const ADAPTER_NAME_SET = new Set<string>(ADAPTER_NAMES);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
const ROLE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EVENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const EXTERNAL_SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const CONNECTOR_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{3,127}$/;
const SIGNATURE_PATTERN = /^v1=([a-f0-9]{64})$/i;
const INGEST_BODY_FIELDS = [
  'adapter',
  'channel',
  'externalSessionId',
  'draftId',
  'roles',
  'metadata',
  'fromRole',
  'toRole',
  'type',
  'payload',
  'connectorId',
  'eventId',
] as const;
const INGEST_MAX_ROLES = 12;
const INGEST_MAX_PAYLOAD_KEYS = 48;
const INGEST_MAX_METADATA_KEYS = 48;
const INGEST_MAX_PAYLOAD_BYTES = 16_384;

const CONNECTOR_ALLOWLIST = new Set(
  env.AGENT_GATEWAY_INGEST_ALLOWED_CONNECTORS.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const assertAllowedQueryFields = (
  query: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  const queryRecord =
    query && typeof query === 'object'
      ? (query as Record<string, unknown>)
      : {};
  const unknown = Object.keys(queryRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported query fields: ${unknown.join(', ')}`,
      400,
    );
  }
};

const assertAllowedBodyFields = (
  body: unknown,
  allowed: readonly string[],
  errorCode: string,
) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ServiceError(errorCode, 'Request body must be an object.', 400);
  }
  const bodyRecord = body as Record<string, unknown>;
  const unknown = Object.keys(bodyRecord).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new ServiceError(
      errorCode,
      `Unsupported body fields: ${unknown.join(', ')}`,
      400,
    );
  }
  return bodyRecord;
};

const parseHeaderValue = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? null;

const parseRequiredString = (
  value: unknown,
  {
    fieldName,
    pattern,
    errorCode,
  }: {
    fieldName: string;
    pattern: RegExp;
    errorCode: string;
  },
) => {
  if (typeof value !== 'string') {
    throw new ServiceError(errorCode, `${fieldName} is required.`, 400);
  }
  const normalized = value.trim();
  if (!(normalized && pattern.test(normalized))) {
    throw new ServiceError(errorCode, `${fieldName} is invalid.`, 400);
  }
  return normalized.toLowerCase();
};

const parseOptionalString = (
  value: unknown,
  {
    fieldName,
    pattern,
    errorCode,
  }: {
    fieldName: string;
    pattern: RegExp;
    errorCode: string;
  },
) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(errorCode, `${fieldName} is invalid.`, 400);
  }
  const normalized = value.trim();
  if (!(normalized && pattern.test(normalized))) {
    throw new ServiceError(errorCode, `${fieldName} is invalid.`, 400);
  }
  return normalized.toLowerCase();
};

const parseOptionalUuid = (
  value: unknown,
  fieldName: string,
  errorCode: string,
) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new ServiceError(errorCode, `${fieldName} is invalid.`, 400);
  }
  return value.trim();
};

const parseOptionalObject = (
  value: unknown,
  {
    fieldName,
    maxKeys,
    maxBytes,
    errorCode,
  }: {
    fieldName: string;
    maxKeys: number;
    maxBytes: number;
    errorCode: string;
  },
) => {
  if (value === undefined || value === null) {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(errorCode, `${fieldName} must be an object.`, 400);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length > maxKeys) {
    throw new ServiceError(errorCode, `${fieldName} has too many keys.`, 400);
  }
  const bytes = Buffer.byteLength(JSON.stringify(record), 'utf8');
  if (bytes > maxBytes) {
    throw new ServiceError(errorCode, `${fieldName} is too large.`, 400);
  }
  return record;
};

const parseOptionalRoles = (value: unknown, errorCode: string): string[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ServiceError(
      errorCode,
      'roles must be an array of strings.',
      400,
    );
  }
  const roles = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const uniqueRoles = [...new Set(roles)];
  if (uniqueRoles.length > INGEST_MAX_ROLES) {
    throw new ServiceError(errorCode, 'roles exceed max items.', 400);
  }
  if (uniqueRoles.some((role) => !ROLE_PATTERN.test(role))) {
    throw new ServiceError(errorCode, 'roles contain invalid entries.', 400);
  }
  return uniqueRoles;
};

const sortDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => sortDeep(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortDeep(record[key])]),
  );
};

const stableStringify = (value: unknown) => JSON.stringify(sortDeep(value));

const parseSignature = (value: string | null) => {
  if (!value) {
    throw new ServiceError(
      'AGENT_GATEWAY_INGEST_SIGNATURE_INVALID',
      'Missing signature header.',
      401,
    );
  }
  const match = SIGNATURE_PATTERN.exec(value);
  if (!match) {
    throw new ServiceError(
      'AGENT_GATEWAY_INGEST_SIGNATURE_INVALID',
      'Invalid signature format.',
      401,
    );
  }
  return match[1].toLowerCase();
};

const parseSignatureTimestamp = (value: string | null) => {
  if (!value) {
    throw new ServiceError(
      'AGENT_GATEWAY_INGEST_SIGNATURE_INVALID',
      'Missing signature timestamp header.',
      401,
    );
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ServiceError(
      'AGENT_GATEWAY_INGEST_SIGNATURE_INVALID',
      'Invalid signature timestamp header.',
      401,
    );
  }
  const skew = Math.abs(Math.floor(Date.now() / 1000) - parsed);
  if (skew > env.AGENT_GATEWAY_INGEST_MAX_TIMESTAMP_SKEW_SEC) {
    throw new ServiceError(
      'AGENT_GATEWAY_INGEST_SIGNATURE_EXPIRED',
      'Signature timestamp is outside allowed skew.',
      401,
    );
  }
  return parsed;
};

const verifySignature = (params: {
  signatureHex: string;
  timestamp: number;
  body: Record<string, unknown>;
}) => {
  const expected = crypto
    .createHmac('sha256', env.AGENT_GATEWAY_WEBHOOK_SECRET)
    .update(`${params.timestamp}.${stableStringify(params.body)}`)
    .digest('hex');
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(params.signatureHex, 'utf8');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new ServiceError(
      'AGENT_GATEWAY_INGEST_SIGNATURE_INVALID',
      'Signature verification failed.',
      401,
    );
  }
};

const writeIngestTelemetry = async (
  eventType:
    | 'agent_gateway_ingest_accept'
    | 'agent_gateway_ingest_replay'
    | 'agent_gateway_ingest_reject',
  status: 'failed' | 'ok',
  metadata: Record<string, unknown>,
) => {
  try {
    await db.query(
      `INSERT INTO ux_events (event_type, user_type, status, source, metadata)
       VALUES ($1, 'system', $2, 'agent_gateway_ingest', $3::jsonb)`,
      [eventType, status, JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error('agent gateway ingest telemetry write failed', error);
  }
};

router.post(
  '/agent-gateway/adapters/ingest',
  computeHeavyRateLimiter,
  async (req, res, next) => {
    let idempotencyRedisKey: string | null = null;

    try {
      const body = assertAllowedBodyFields(
        req.body,
        INGEST_BODY_FIELDS,
        'AGENT_GATEWAY_INGEST_INVALID_FIELDS',
      );
      assertAllowedQueryFields(
        req.query,
        [],
        'AGENT_GATEWAY_INGEST_INVALID_QUERY_FIELDS',
      );

      if (!env.AGENT_GATEWAY_WEBHOOK_SECRET) {
        throw new ServiceError(
          'AGENT_GATEWAY_INGEST_UNAVAILABLE',
          'Gateway ingest secret is not configured.',
          503,
        );
      }

      const adapterRaw = parseOptionalString(body.adapter, {
        fieldName: 'adapter',
        pattern: CHANNEL_PATTERN,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });
      const adapter = (adapterRaw ??
        'external_webhook') as AgentGatewayAdapterName;
      if (!ADAPTER_NAME_SET.has(adapter)) {
        throw new ServiceError(
          'AGENT_GATEWAY_INGEST_INVALID_INPUT',
          'adapter is not supported.',
          400,
        );
      }

      const channel = parseRequiredString(body.channel, {
        fieldName: 'channel',
        pattern: CHANNEL_PATTERN,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });
      const externalSessionId = parseRequiredString(body.externalSessionId, {
        fieldName: 'externalSessionId',
        pattern: EXTERNAL_SESSION_ID_PATTERN,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });
      const fromRole = parseRequiredString(body.fromRole, {
        fieldName: 'fromRole',
        pattern: ROLE_PATTERN,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });
      const toRole = parseOptionalString(body.toRole, {
        fieldName: 'toRole',
        pattern: ROLE_PATTERN,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });
      const type = parseRequiredString(body.type, {
        fieldName: 'type',
        pattern: EVENT_TYPE_PATTERN,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });
      const draftId = parseOptionalUuid(
        body.draftId,
        'draftId',
        'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      );
      const roles = parseOptionalRoles(
        body.roles,
        'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      );
      const payload = parseOptionalObject(body.payload, {
        fieldName: 'payload',
        maxKeys: INGEST_MAX_PAYLOAD_KEYS,
        maxBytes: INGEST_MAX_PAYLOAD_BYTES,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });
      const metadata = parseOptionalObject(body.metadata, {
        fieldName: 'metadata',
        maxKeys: INGEST_MAX_METADATA_KEYS,
        maxBytes: INGEST_MAX_PAYLOAD_BYTES,
        errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
      });

      const connectorId = parseRequiredString(
        body.connectorId ??
          parseHeaderValue(req.headers['x-gateway-connector-id']),
        {
          fieldName: 'connectorId',
          pattern: CONNECTOR_ID_PATTERN,
          errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
        },
      );
      if (
        CONNECTOR_ALLOWLIST.size > 0 &&
        !CONNECTOR_ALLOWLIST.has(connectorId)
      ) {
        throw new ServiceError(
          'AGENT_GATEWAY_INGEST_CONNECTOR_FORBIDDEN',
          'Connector is not allowlisted.',
          403,
        );
      }

      const eventId = parseRequiredString(
        body.eventId ?? parseHeaderValue(req.headers['x-idempotency-key']),
        {
          fieldName: 'eventId',
          pattern: IDEMPOTENCY_KEY_PATTERN,
          errorCode: 'AGENT_GATEWAY_INGEST_INVALID_INPUT',
        },
      );

      const signature = parseSignature(
        parseHeaderValue(req.headers['x-gateway-signature']),
      );
      const signatureTimestamp = parseSignatureTimestamp(
        parseHeaderValue(req.headers['x-gateway-timestamp']),
      );
      verifySignature({
        signatureHex: signature,
        timestamp: signatureTimestamp,
        body,
      });

      idempotencyRedisKey = [
        'agent_gateway',
        'adapter_ingest',
        connectorId,
        adapter,
        channel,
        eventId,
      ].join(':');
      const idempotencyTick = await redis.incr(idempotencyRedisKey);
      if (idempotencyTick === 1) {
        await redis.expire(
          idempotencyRedisKey,
          env.AGENT_GATEWAY_INGEST_IDEMPOTENCY_TTL_SEC,
        );
      } else {
        await writeIngestTelemetry('agent_gateway_ingest_replay', 'ok', {
          adapter,
          channel,
          connectorId,
          eventId,
          externalSessionId,
        });
        return res.status(200).json({
          applied: false,
          deduplicated: true,
          adapter,
          channel,
          connectorId,
          eventId,
        });
      }

      const routed = await agentGatewayAdapterService.routeExternalEvent({
        adapter,
        channel,
        externalSessionId,
        draftId,
        roles,
        metadata: {
          ...metadata,
          connectorId,
          eventId,
          signatureTimestamp,
          ingestReceivedAt: new Date().toISOString(),
        },
        fromRole,
        toRole,
        type,
        payload: {
          ...payload,
          connectorId,
          eventId,
        },
        persist: true,
      });

      await writeIngestTelemetry('agent_gateway_ingest_accept', 'ok', {
        adapter,
        channel,
        connectorId,
        eventId,
        sessionId: routed.session.id,
        gatewayEventId: routed.event.id,
      });
      return res.status(201).json({
        applied: true,
        deduplicated: false,
        adapter,
        channel,
        connectorId,
        eventId,
        sessionId: routed.session.id,
        event: routed.event,
      });
    } catch (error) {
      if (idempotencyRedisKey) {
        await redis.del(idempotencyRedisKey);
      }
      if (error instanceof ServiceError) {
        await writeIngestTelemetry('agent_gateway_ingest_reject', 'failed', {
          code: error.code,
          message: error.message,
          statusCode: error.status,
        });
      }
      next(error);
    }
  },
);

export default router;
