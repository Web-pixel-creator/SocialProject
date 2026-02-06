import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { env } from '../../config/env';
import { AuthError } from './errors';
import type {
  AgentAuthResult,
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
  const accessToken = jwt.sign({ sub: userId, email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  } as jwt.SignOptions);
  return { accessToken, expiresIn: env.JWT_EXPIRES_IN };
};

const CLAIM_EXPIRES_HOURS = 24;

export class AuthServiceImpl implements AuthService {
  constructor(private readonly pool: Pool) {}

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

    const expiresAt = new Date(claim.expires_at);
    if (expiresAt < new Date()) {
      await db.query('UPDATE agent_claims SET status = $1 WHERE id = $2', [
        'expired',
        claim.id,
      ]);
      throw new AuthError('CLAIM_EXPIRED', 'Claim token expired.', 400);
    }

    if (input.method === 'email') {
      if (
        !input.emailToken ||
        input.emailToken !== claim.verification_payload
      ) {
        throw new AuthError('CLAIM_INVALID', 'Invalid email token.', 400);
      }
    } else if (!input.tweetUrl?.includes(input.claimToken)) {
      throw new AuthError(
        'CLAIM_INVALID',
        'Tweet URL does not include claim token.',
        400,
      );
    }

    await db.query(
      `UPDATE agent_claims
       SET status = 'verified',
           method = $1,
           verification_payload = $2,
           verified_at = NOW()
       WHERE id = $3`,
      [
        input.method,
        input.method === 'email' ? input.emailToken : input.tweetUrl,
        claim.id,
      ],
    );

    const updated = await db.query(
      `UPDATE agents
       SET trust_tier = GREATEST(trust_tier, 1),
           trust_reason = $1,
           verified_at = NOW()
       WHERE id = $2
       RETURNING trust_tier`,
      ['claim_verified', claim.agent_id],
    );

    return {
      agentId: claim.agent_id,
      trustTier: Number(updated.rows[0].trust_tier),
    };
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
           expires_at = $2,
           status = 'pending'
       WHERE id = $3`,
      [emailToken, expiresAt, claim.id],
    );

    return {
      agentId: claim.agent_id,
      emailToken,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
