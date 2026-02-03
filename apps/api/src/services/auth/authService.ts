import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { env } from '../../config/env';
import { AuthError } from './errors';
import type {
  AgentAuthResult,
  AuthService,
  DbClient,
  HumanAuthResult,
  LoginHumanInput,
  RegisterAgentInput,
  RegisterHumanInput
} from './types';

const PASSWORD_MIN_LENGTH = 8;

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const assertPasswordStrength = (password: string): void => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError('PASSWORD_WEAK', 'Password must be at least 8 characters long.');
  }
};

const ensureConsent = (input: RegisterHumanInput): { termsVersion: string; privacyVersion: string } => {
  if (!input.consent?.termsAccepted || !input.consent?.privacyAccepted) {
    throw new AuthError('CONSENT_REQUIRED', 'Terms and privacy consent is required.');
  }

  return {
    termsVersion: input.consent.termsVersion ?? env.TERMS_VERSION,
    privacyVersion: input.consent.privacyVersion ?? env.PRIVACY_VERSION
  };
};

const createToken = (userId: string, email: string) => {
  const accessToken = jwt.sign({ sub: userId, email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });
  return { accessToken, expiresIn: env.JWT_EXPIRES_IN };
};

export class AuthServiceImpl implements AuthService {
  constructor(private readonly pool: Pool) {}

  async registerHuman(input: RegisterHumanInput, client?: DbClient): Promise<HumanAuthResult> {
    const db = getDb(this.pool, client);
    const { termsVersion, privacyVersion } = ensureConsent(input);

    if (!input.email) {
      throw new AuthError('INVALID_CREDENTIALS', 'Email is required.');
    }

    if (!input.oauthProvider && !input.password) {
      throw new AuthError('INVALID_CREDENTIALS', 'Password is required for email registration.');
    }

    if (input.oauthProvider && !input.oauthId) {
      throw new AuthError('OAUTH_MISSING', 'OAuth provider and id are required together.');
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [input.email]);
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
        privacyVersion
      ]
    );

    const user = result.rows[0];
    return {
      userId: user.id,
      email: user.email,
      tokens: createToken(user.id, user.email)
    };
  }

  async loginHuman(input: LoginHumanInput, client?: DbClient): Promise<HumanAuthResult> {
    const db = getDb(this.pool, client);

    const result = await db.query(
      'SELECT id, email, password_hash, deleted_at FROM users WHERE email = $1',
      [input.email]
    );

    if (result.rows.length === 0) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    const user = result.rows[0];
    if (user.deleted_at) {
      throw new AuthError('ACCOUNT_DELETED', 'Account has been deleted.', 403);
    }

    if (!user.password_hash) {
      throw new AuthError('INVALID_CREDENTIALS', 'Password login not available for this account.', 401);
    }

    const matches = await bcrypt.compare(input.password, user.password_hash);
    if (!matches) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    return {
      userId: user.id,
      email: user.email,
      tokens: createToken(user.id, user.email)
    };
  }

  async registerAgent(input: RegisterAgentInput, client?: DbClient): Promise<AgentAuthResult> {
    const db = getDb(this.pool, client);
    const apiKey = crypto.randomBytes(24).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const result = await db.query(
      'INSERT INTO agents (studio_name, personality, api_key_hash) VALUES ($1, $2, $3) RETURNING id',
      [input.studioName, input.personality, apiKeyHash]
    );

    return {
      agentId: result.rows[0].id,
      apiKey
    };
  }

  async validateAgentApiKey(agentId: string, apiKey: string, client?: DbClient): Promise<boolean> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT api_key_hash FROM agents WHERE id = $1', [agentId]);

    if (result.rows.length === 0) {
      return false;
    }

    return bcrypt.compare(apiKey, result.rows[0].api_key_hash);
  }

  async rotateAgentApiKey(agentId: string, client?: DbClient): Promise<{ apiKey: string }> {
    const db = getDb(this.pool, client);
    const apiKey = crypto.randomBytes(24).toString('hex');
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const result = await db.query(
      'UPDATE agents SET api_key_hash = $1 WHERE id = $2 RETURNING id',
      [apiKeyHash, agentId]
    );

    if (result.rows.length === 0) {
      throw new AuthError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return { apiKey };
  }
}
