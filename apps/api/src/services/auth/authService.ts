import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { env } from '../../config/env';
import { logger } from '../../logging/logger';
import { AuthError } from './errors';
import type {
  AgentAuthResult,
  AgentClaimStatusResult,
  AgentVerificationMethod,
  AgentVerificationMetrics,
  AgentVerificationSummary,
  AuthService,
  DbClient,
  HumanAuthResult,
  LoginHumanInput,
  RegisterAgentInput,
  RegisterHumanInput,
} from './types';

const PASSWORD_MIN_LENGTH = 8;

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const assertPasswordStrength = (password: string): void => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(
      'PASSWORD_WEAK',
      'Password must be at least 8 characters long.',
    );
  }
};

const ensureConsent = (
  input: RegisterHumanInput,
): { termsVersion: string; privacyVersion: string } => {
  if (!(input.consent?.termsAccepted && input.consent?.privacyAccepted)) {
    throw new AuthError(
      'CONSENT_REQUIRED',
      'Terms and privacy consent is required.',
    );
  }

  return {
    termsVersion: input.consent.termsVersion ?? env.TERMS_VERSION,
    privacyVersion: input.consent.privacyVersion ?? env.PRIVACY_VERSION,
  };
};

const createToken = (userId: string, email: string) => {
  const signOptions: jwt.SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  };
  const accessToken = jwt.sign(
    { sub: userId, email },
    env.JWT_SECRET,
    signOptions,
  );
  return { accessToken, expiresIn: env.JWT_EXPIRES_IN };
};

const CLAIM_EXPIRES_HOURS = 24;
const X_STATUS_HOSTS = new Set([
  'mobile.twitter.com',
  'twitter.com',
  'www.twitter.com',
  'www.x.com',
  'x.com',
]);
const X_STATUS_ID_PATTERN = /^\d+$/;

const writeClaimTelemetry = async (params: {
  db: DbClient;
  eventType: 'claim_created' | 'claim_verified' | 'claim_failed';
  userType: 'agent' | 'anonymous';
  userId: string | null;
  status: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await params.db.query(
      `INSERT INTO ux_events
       (event_type, user_type, user_id, source, status, metadata)
       VALUES ($1, $2, $3, 'api', $4, $5)`,
      [
        params.eventType,
        params.userType,
        params.userId,
        params.status,
        params.metadata ?? {},
      ],
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        eventType: params.eventType,
        userType: params.userType,
        userId: params.userId,
      },
      'claim telemetry insert failed',
    );
  }
};

const normalizeXClaimUrl = (
  tweetUrl: string,
  claimToken: string,
): string | null => {
  const trimmed = tweetUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!(parsed.protocol === 'https:' || parsed.protocol === 'http:')) {
    return null;
  }

  if (!X_STATUS_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null;
  }

  const pathSegments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const statusIndex = pathSegments.findIndex(
    (segment) => segment.toLowerCase() === 'status',
  );
  if (statusIndex < 1 || statusIndex >= pathSegments.length - 1) {
    return null;
  }

  const statusId = pathSegments[statusIndex + 1];
  if (!X_STATUS_ID_PATTERN.test(statusId)) {
    return null;
  }

  const queryClaimToken =
    parsed.searchParams.get('claimToken') ??
    parsed.searchParams.get('claim_token');
  if (queryClaimToken !== claimToken) {
    return null;
  }

  return parsed.toString();
};

const toNullableIsoTimestamp = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  }
  return null;
};

const toVerificationMethod = (
  value: unknown,
): AgentVerificationMethod | null =>
  value === 'x' || value === 'email' ? value : null;

const resolveVerificationStatus = (params: {
  revokedAt: unknown;
  verifiedAt: unknown;
}): AgentVerificationSummary['verificationStatus'] => {
  if (toNullableIsoTimestamp(params.revokedAt)) {
    return 'revoked';
  }
  if (toNullableIsoTimestamp(params.verifiedAt)) {
    return 'verified';
  }
  return 'unverified';
};

const resolveVerificationMethod = (params: {
  latestClaimMethod: unknown;
  latestTerminalMethod: unknown;
  verificationStatus: AgentVerificationSummary['verificationStatus'];
}): AgentVerificationMethod | null => {
  const latestClaimMethod = toVerificationMethod(params.latestClaimMethod);
  const latestTerminalMethod = toVerificationMethod(
    params.latestTerminalMethod,
  );
  if (params.verificationStatus === 'unverified') {
    return null;
  }
  if (params.verificationStatus === 'revoked') {
    return latestClaimMethod ?? latestTerminalMethod;
  }
  return latestTerminalMethod ?? latestClaimMethod;
};

const resolveVerificationBadge = (
  verificationStatus: AgentVerificationSummary['verificationStatus'],
): AgentVerificationSummary['badge'] => {
  if (verificationStatus === 'verified') {
    return {
      label: 'Verified',
      tone: 'success',
    };
  }
  if (verificationStatus === 'revoked') {
    return {
      label: 'Revoked',
      tone: 'alert',
    };
  }
  return {
    label: 'Unverified',
    tone: 'muted',
  };
};

const resolveClaimLifecycleStatus = (params: {
  status: unknown;
  expiresAt: unknown;
}): AgentClaimStatusResult['status'] => {
  if (params.status === 'revoked') {
    return 'revoked';
  }
  if (params.status === 'verified') {
    return 'verified';
  }
  const expiresAt = toNullableIsoTimestamp(params.expiresAt);
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return 'expired';
  }
  return 'pending';
};

export class AuthServiceImpl implements AuthService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async registerHuman(
    input: RegisterHumanInput,
    client?: DbClient,
  ): Promise<HumanAuthResult> {
    const db = getDb(this.pool, client);
    const { termsVersion, privacyVersion } = ensureConsent(input);

    if (!input.email) {
      throw new AuthError('INVALID_CREDENTIALS', 'Email is required.');
    }

    if (!(input.oauthProvider || input.password)) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Password is required for email registration.',
      );
    }

    if (input.oauthProvider && !input.oauthId) {
      throw new AuthError(
        'OAUTH_MISSING',
        'OAuth provider and id are required together.',
      );
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [
      input.email,
    ]);
    if (existing.rows.length > 0) {
      throw new AuthError('EMAIL_EXISTS', 'Email already registered.');
    }

    let passwordHash: string | null = null;
    if (input.password) {
      assertPasswordStrength(input.password);
      passwordHash = await bcrypt.hash(input.password, 10);
    }

    const result = await db.query(
      `INSERT INTO users
        (email, password_hash, oauth_provider, oauth_id, terms_version, terms_accepted_at, privacy_version, privacy_accepted_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW())
       RETURNING id, email`,
      [
        input.email,
        passwordHash,
        input.oauthProvider ?? null,
        input.oauthId ?? null,
        termsVersion,
        privacyVersion,
      ],
    );

    const user = result.rows[0];
    return {
      userId: user.id,
      email: user.email,
      tokens: createToken(user.id, user.email),
    };
  }

  async loginHuman(
    input: LoginHumanInput,
    client?: DbClient,
  ): Promise<HumanAuthResult> {
    const db = getDb(this.pool, client);

    const result = await db.query(
      'SELECT id, email, password_hash, deleted_at FROM users WHERE email = $1',
      [input.email],
    );

    if (result.rows.length === 0) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
        401,
      );
    }

    const user = result.rows[0];
    if (user.deleted_at) {
      throw new AuthError('ACCOUNT_DELETED', 'Account has been deleted.', 403);
    }

    if (!user.password_hash) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Password login not available for this account.',
        401,
      );
    }

    const matches = await bcrypt.compare(input.password, user.password_hash);
    if (!matches) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
        401,
      );
    }

    return {
      userId: user.id,
      email: user.email,
      tokens: createToken(user.id, user.email),
    };
  }

  async registerAgent(
    input: RegisterAgentInput,
    client?: DbClient,
  ): Promise<AgentAuthResult> {
    const db = getDb(this.pool, client);
    const apiKey = crypto.randomBytes(24).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const result = await db.query(
      'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
      [input.studioName, input.personality, apiKeyHash],
    );

    const claimToken = crypto.randomBytes(24).toString('hex');
    const emailToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(
      Date.now() + CLAIM_EXPIRES_HOURS * 60 * 60 * 1000,
    );

    await db.query(
      `INSERT INTO agent_claims (agent_id, method, status, claim_token, verification_payload, expires_at)
       VALUES ($1, $2, 'pending', $3, $4, $5)`,
      [result.rows[0].id, 'email', claimToken, emailToken, expiresAt],
    );

    await writeClaimTelemetry({
      db,
      eventType: 'claim_created',
      userType: 'agent',
      userId: result.rows[0].id as string,
      status: 'pending',
      metadata: {
        agentId: result.rows[0].id,
        method: 'email',
      },
    });

    return {
      agentId: result.rows[0].id,
      apiKey,
      claimToken,
      emailToken,
    };
  }

  async validateAgentApiKey(
    agentId: string,
    apiKey: string,
    client?: DbClient,
  ): Promise<boolean> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      'SELECT api_key_hash FROM agents WHERE id = $1',
      [agentId],
    );

    if (result.rows.length === 0) {
      return false;
    }

    return bcrypt.compare(apiKey, result.rows[0].api_key_hash);
  }

  async rotateAgentApiKey(
    agentId: string,
    client?: DbClient,
  ): Promise<{ apiKey: string }> {
    const db = getDb(this.pool, client);
    const apiKey = crypto.randomBytes(24).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const result = await db.query(
      'UPDATE agents SET api_key_hash = $1 WHERE id = $2 RETURNING id',
      [apiKeyHash, agentId],
    );

    if (result.rows.length === 0) {
      throw new AuthError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return { apiKey };
  }

  async verifyAgentClaim(
    input: {
      claimToken: string;
      method: 'x' | 'email';
      tweetUrl?: string;
      emailToken?: string;
    },
    client?: DbClient,
  ): Promise<{ agentId: string; trustTier: number }> {
    const db = getDb(this.pool, client);
    try {
      const claimResult = await db.query(
        'SELECT * FROM agent_claims WHERE claim_token = $1 ORDER BY created_at DESC LIMIT 1',
        [input.claimToken],
      );

      if (claimResult.rows.length === 0) {
        throw new AuthError('CLAIM_NOT_FOUND', 'Claim not found.', 404);
      }

      const claim = claimResult.rows[0];
      if (claim.status === 'verified') {
        const agent = await db.query(
          'SELECT trust_tier FROM agents WHERE id = $1',
          [claim.agent_id],
        );
        return {
          agentId: claim.agent_id,
          trustTier: Number(agent.rows[0]?.trust_tier ?? 1),
        };
      }
      if (claim.status === 'revoked') {
        throw new AuthError(
          'CLAIM_REVOKED',
          'Claim has been revoked. Request a resend before verifying again.',
          400,
        );
      }

      const expiresAt = new Date(claim.expires_at);
      if (expiresAt < new Date()) {
        await db.query('UPDATE agent_claims SET status = $1 WHERE id = $2', [
          'expired',
          claim.id,
        ]);
        throw new AuthError('CLAIM_EXPIRED', 'Claim token expired.', 400);
      }

      let verificationPayload: string;
      if (input.method === 'email') {
        if (
          !input.emailToken ||
          input.emailToken !== claim.verification_payload
        ) {
          throw new AuthError('CLAIM_INVALID', 'Invalid email token.', 400);
        }
        verificationPayload = input.emailToken;
      } else {
        const normalizedTweetUrl =
          typeof input.tweetUrl === 'string'
            ? normalizeXClaimUrl(input.tweetUrl, input.claimToken)
            : null;
        if (!normalizedTweetUrl) {
          throw new AuthError(
            'CLAIM_INVALID',
            'Tweet URL must be an x.com or twitter.com status URL with a matching claimToken query parameter.',
            400,
          );
        }
        verificationPayload = normalizedTweetUrl;
      }

      await db.query(
        `UPDATE agent_claims
         SET status = 'verified',
             method = $1,
             verification_payload = $2,
             verified_at = NOW()
         WHERE id = $3`,
        [input.method, verificationPayload, claim.id],
      );

      const updated = await db.query(
        `UPDATE agents
         SET trust_tier = GREATEST(trust_tier, 1),
             revoked_at = NULL,
             trust_reason = $1,
             verified_at = NOW()
         WHERE id = $2
         RETURNING trust_tier`,
        ['claim_verified', claim.agent_id],
      );

      await writeClaimTelemetry({
        db,
        eventType: 'claim_verified',
        userType: 'agent',
        userId: claim.agent_id as string,
        status: 'verified',
        metadata: {
          agentId: claim.agent_id,
          method: input.method,
          trustTier: Number(updated.rows[0].trust_tier),
        },
      });

      return {
        agentId: claim.agent_id,
        trustTier: Number(updated.rows[0].trust_tier),
      };
    } catch (error) {
      if (error instanceof AuthError) {
        await writeClaimTelemetry({
          db,
          eventType: 'claim_failed',
          userType: 'anonymous',
          userId: null,
          status: 'error',
          metadata: {
            errorCode: error.code,
            method: input.method,
          },
        });
      }
      throw error;
    }
  }

  async resendAgentClaim(
    input: { claimToken: string },
    client?: DbClient,
  ): Promise<{ agentId: string; emailToken: string; expiresAt: string }> {
    const db = getDb(this.pool, client);
    const claimResult = await db.query(
      'SELECT * FROM agent_claims WHERE claim_token = $1 ORDER BY created_at DESC LIMIT 1',
      [input.claimToken],
    );

    if (claimResult.rows.length === 0) {
      throw new AuthError('CLAIM_NOT_FOUND', 'Claim not found.', 404);
    }

    const claim = claimResult.rows[0];
    if (claim.status === 'verified') {
      throw new AuthError(
        'CLAIM_ALREADY_VERIFIED',
        'Claim already verified.',
        200,
      );
    }

    const emailToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(
      Date.now() + CLAIM_EXPIRES_HOURS * 60 * 60 * 1000,
    );

    await db.query(
      `UPDATE agent_claims
       SET verification_payload = $1,
           method = 'email',
           expires_at = $2,
           status = 'pending',
           verified_at = NULL
       WHERE id = $3`,
      [emailToken, expiresAt, claim.id],
    );

    return {
      agentId: claim.agent_id,
      emailToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async revokeAgentVerification(
    input: { agentId: string; reason?: string },
    client?: DbClient,
  ): Promise<AgentVerificationSummary> {
    const db = getDb(this.pool, client);
    const agentResult = await db.query(
      'SELECT id, verified_at FROM agents WHERE id = $1',
      [input.agentId],
    );

    if (agentResult.rows.length === 0) {
      throw new AuthError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    if (!toNullableIsoTimestamp(agentResult.rows[0]?.verified_at)) {
      throw new AuthError('AGENT_NOT_VERIFIED', 'Agent is not verified.', 409);
    }

    const claimResult = await db.query(
      `SELECT id
       FROM agent_claims
       WHERE agent_id = $1
         AND status = 'verified'
       ORDER BY verified_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [input.agentId],
    );

    if (claimResult.rows.length === 0) {
      throw new AuthError('CLAIM_NOT_FOUND', 'Claim not found.', 404);
    }

    await db.query(
      `UPDATE agent_claims
       SET status = 'revoked'
       WHERE id = $1`,
      [claimResult.rows[0].id],
    );

    await db.query(
      `UPDATE agents
       SET trust_tier = 0,
           trust_reason = $1,
           verified_at = NULL,
           revoked_at = NOW()
       WHERE id = $2`,
      [input.reason?.trim() || 'claim_revoked', input.agentId],
    );

    const summary = await this.getAgentVerificationSummary(input.agentId, db);
    if (!summary) {
      throw new AuthError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return summary;
  }

  async getAgentVerificationSummary(
    agentId: string,
    client?: DbClient,
  ): Promise<AgentVerificationSummary | null> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      `SELECT
         a.id,
         a.trust_tier,
         a.verified_at,
         a.revoked_at,
         latest_claim.method AS latest_claim_method,
         latest_terminal.method AS latest_terminal_method
       FROM agents a
       LEFT JOIN LATERAL (
         SELECT method
         FROM agent_claims
         WHERE agent_id = a.id
         ORDER BY created_at DESC
         LIMIT 1
       ) latest_claim ON true
       LEFT JOIN LATERAL (
         SELECT method
         FROM agent_claims
         WHERE agent_id = a.id
           AND status IN ('verified', 'revoked')
         ORDER BY COALESCE(verified_at, created_at) DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) latest_terminal ON true
       WHERE a.id = $1`,
      [agentId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const verificationStatus = resolveVerificationStatus({
      revokedAt: row.revoked_at,
      verifiedAt: row.verified_at,
    });

    return {
      agentId: row.id as string,
      verificationStatus,
      verificationMethod: resolveVerificationMethod({
        latestClaimMethod: row.latest_claim_method,
        latestTerminalMethod: row.latest_terminal_method,
        verificationStatus,
      }),
      verifiedAt: toNullableIsoTimestamp(row.verified_at),
      revokedAt: toNullableIsoTimestamp(row.revoked_at),
      badge: resolveVerificationBadge(verificationStatus),
    };
  }

  async getAgentClaimStatus(
    agentId: string,
    client?: DbClient,
  ): Promise<AgentClaimStatusResult | null> {
    const db = getDb(this.pool, client);
    const result = await db.query(
      `SELECT
         a.id,
         a.trust_tier,
         a.verified_at AS agent_verified_at,
         a.revoked_at AS agent_revoked_at,
         latest_claim.claim_token,
         latest_claim.method,
         latest_claim.status,
         latest_claim.expires_at,
         latest_claim.verified_at AS claim_verified_at
       FROM agents a
       LEFT JOIN LATERAL (
         SELECT claim_token, method, status, expires_at, verified_at, created_at
         FROM agent_claims
         WHERE agent_id = a.id
         ORDER BY created_at DESC
         LIMIT 1
       ) latest_claim ON true
       WHERE a.id = $1`,
      [agentId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (typeof row.claim_token !== 'string' || row.claim_token.length === 0) {
      return null;
    }

    return {
      agentId: row.id as string,
      claimToken: row.claim_token as string,
      status: resolveClaimLifecycleStatus({
        status: row.status,
        expiresAt: row.expires_at,
      }),
      method: toVerificationMethod(row.method),
      expiresAt: toNullableIsoTimestamp(row.expires_at),
      verifiedAt: toNullableIsoTimestamp(row.claim_verified_at),
      revokedAt: toNullableIsoTimestamp(row.agent_revoked_at),
      verificationStatus: resolveVerificationStatus({
        revokedAt: row.agent_revoked_at,
        verifiedAt: row.agent_verified_at,
      }),
    };
  }

  async getVerificationMetrics(
    client?: DbClient,
  ): Promise<AgentVerificationMetrics> {
    const db = getDb(this.pool, client);
    const latestClaimsResult = await db.query(
      `SELECT agent_id, method, status, created_at, expires_at, verified_at
       FROM (
         SELECT DISTINCT ON (agent_id)
           agent_id,
           method,
           status,
           created_at,
           expires_at,
           verified_at
         FROM agent_claims
         ORDER BY agent_id, created_at DESC, claim_token DESC
       ) latest_claims`,
    );
    const totalsResult = await db.query(
      `SELECT
         COUNT(*)::int AS total_agents,
         COUNT(*) FILTER (WHERE verified_at IS NOT NULL AND revoked_at IS NULL)::int AS verified_agents,
         COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS revoked_agents
       FROM agents`,
    );
    const telemetryTotalsResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'claim_created')::int AS claim_created_count,
         COUNT(*) FILTER (WHERE event_type = 'claim_verified')::int AS claim_verified_count,
         COUNT(*) FILTER (WHERE event_type = 'claim_failed')::int AS claim_failed_count,
         COUNT(*) FILTER (WHERE event_type = 'blocked_actions')::int AS blocked_action_count
       FROM ux_events`,
    );
    const failureReasonResult = await db.query(
      `SELECT
         COALESCE(metadata->>'errorCode', 'unknown') AS error_code,
         COUNT(*)::int AS count
       FROM ux_events
       WHERE event_type = 'claim_failed'
       GROUP BY error_code
       ORDER BY count DESC, error_code ASC`,
    );

    const totalAgents = Number(totalsResult.rows[0]?.total_agents ?? 0);
    const verifiedAgents = Number(totalsResult.rows[0]?.verified_agents ?? 0);
    const revokedAgents = Number(totalsResult.rows[0]?.revoked_agents ?? 0);
    const byMethod: AgentVerificationMetrics['byMethod'] = {
      email: {
        totalClaims: 0,
        pendingClaims: 0,
        verifiedClaims: 0,
        revokedClaims: 0,
        expiredClaims: 0,
      },
      x: {
        totalClaims: 0,
        pendingClaims: 0,
        verifiedClaims: 0,
        revokedClaims: 0,
        expiredClaims: 0,
      },
    };

    const verifyDurationsHours: number[] = [];
    let pendingClaims = 0;
    let verifiedClaims = 0;
    let revokedClaims = 0;
    let expiredClaims = 0;

    for (const row of latestClaimsResult.rows) {
      const method = row.method === 'x' ? 'x' : 'email';
      const status = resolveClaimLifecycleStatus({
        status: row.status,
        expiresAt: row.expires_at,
      });
      byMethod[method].totalClaims += 1;
      if (status === 'verified') {
        verifiedClaims += 1;
        byMethod[method].verifiedClaims += 1;
        const createdAt = toNullableIsoTimestamp(row.created_at);
        const verifiedAt = toNullableIsoTimestamp(row.verified_at);
        if (createdAt && verifiedAt) {
          const durationHours =
            (new Date(verifiedAt).valueOf() - new Date(createdAt).valueOf()) /
            (60 * 60 * 1000);
          if (Number.isFinite(durationHours) && durationHours >= 0) {
            verifyDurationsHours.push(durationHours);
          }
        }
      } else if (status === 'revoked') {
        revokedClaims += 1;
        byMethod[method].revokedClaims += 1;
      } else if (status === 'expired') {
        expiredClaims += 1;
        byMethod[method].expiredClaims += 1;
      } else {
        pendingClaims += 1;
        byMethod[method].pendingClaims += 1;
      }
    }

    const avgHoursToVerify =
      verifyDurationsHours.length > 0
        ? Number(
            (
              verifyDurationsHours.reduce((sum, value) => sum + value, 0) /
              verifyDurationsHours.length
            ).toFixed(2),
          )
        : null;

    return {
      summary: {
        totalAgents,
        verifiedAgents,
        revokedAgents,
        unverifiedAgents: Math.max(
          totalAgents - verifiedAgents - revokedAgents,
          0,
        ),
        totalClaims: latestClaimsResult.rows.length,
        pendingClaims,
        verifiedClaims,
        revokedClaims,
        expiredClaims,
        verificationRate:
          totalAgents > 0
            ? Number((verifiedAgents / totalAgents).toFixed(3))
            : null,
        avgHoursToVerify,
      },
      byMethod,
      failures: {
        expiredClaims,
        revokedClaims,
      },
      telemetry: {
        claimCreatedCount: Number(
          telemetryTotalsResult.rows[0]?.claim_created_count ?? 0,
        ),
        claimVerifiedCount: Number(
          telemetryTotalsResult.rows[0]?.claim_verified_count ?? 0,
        ),
        claimFailedCount: Number(
          telemetryTotalsResult.rows[0]?.claim_failed_count ?? 0,
        ),
        blockedActionCount: Number(
          telemetryTotalsResult.rows[0]?.blocked_action_count ?? 0,
        ),
        failureReasons: failureReasonResult.rows.map((row) => ({
          errorCode: row.error_code as string,
          count: Number(row.count ?? 0),
        })),
      },
    };
  }
}
