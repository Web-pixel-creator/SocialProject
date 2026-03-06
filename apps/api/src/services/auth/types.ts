export interface ConsentInput {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  termsVersion?: string;
  privacyVersion?: string;
}

export interface RegisterHumanInput {
  email: string;
  password?: string;
  oauthProvider?: string;
  oauthId?: string;
  consent: ConsentInput;
}

export interface LoginHumanInput {
  email: string;
  password: string;
}

export interface RegisterAgentInput {
  studioName: string;
  personality: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface HumanAuthResult {
  userId: string;
  email: string;
  tokens: AuthTokens;
}

export interface AgentAuthResult {
  agentId: string;
  apiKey: string;
  claimToken: string;
  emailToken: string;
}

export type AgentVerificationMethod = 'x' | 'email';
export type AgentVerificationStatus = 'unverified' | 'verified';
export type AgentClaimLifecycleStatus = 'pending' | 'verified' | 'expired';

export interface AgentVerificationSummary {
  agentId: string;
  verificationStatus: AgentVerificationStatus;
  verificationMethod: AgentVerificationMethod | null;
  verifiedAt: string | null;
  badge: {
    label: 'Verified' | 'Unverified';
    tone: 'success' | 'muted';
  };
}

export interface AgentClaimStatusResult {
  agentId: string;
  claimToken: string;
  status: AgentClaimLifecycleStatus;
  method: AgentVerificationMethod | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  verificationStatus: AgentVerificationStatus;
}

export interface AgentVerificationMetrics {
  summary: {
    totalAgents: number;
    verifiedAgents: number;
    unverifiedAgents: number;
    totalClaims: number;
    pendingClaims: number;
    verifiedClaims: number;
    expiredClaims: number;
    verificationRate: number | null;
    avgHoursToVerify: number | null;
  };
  byMethod: Record<
    AgentVerificationMethod,
    {
      totalClaims: number;
      pendingClaims: number;
      verifiedClaims: number;
      expiredClaims: number;
    }
  >;
  failures: {
    expiredClaims: number;
  };
}

export interface AuthService {
  registerHuman(
    input: RegisterHumanInput,
    client?: DbClient,
  ): Promise<HumanAuthResult>;
  loginHuman(
    input: LoginHumanInput,
    client?: DbClient,
  ): Promise<HumanAuthResult>;
  registerAgent(
    input: RegisterAgentInput,
    client?: DbClient,
  ): Promise<AgentAuthResult>;
  validateAgentApiKey(
    agentId: string,
    apiKey: string,
    client?: DbClient,
  ): Promise<boolean>;
  rotateAgentApiKey(
    agentId: string,
    client?: DbClient,
  ): Promise<{ apiKey: string }>;
  verifyAgentClaim(
    input: {
      claimToken: string;
      method: 'x' | 'email';
      tweetUrl?: string;
      emailToken?: string;
    },
    client?: DbClient,
  ): Promise<{ agentId: string; trustTier: number }>;
  resendAgentClaim(
    input: { claimToken: string },
    client?: DbClient,
  ): Promise<{ agentId: string; emailToken: string; expiresAt: string }>;
  getAgentVerificationSummary(
    agentId: string,
    client?: DbClient,
  ): Promise<AgentVerificationSummary | null>;
  getAgentClaimStatus(
    agentId: string,
    client?: DbClient,
  ): Promise<AgentClaimStatusResult | null>;
  getVerificationMetrics(client?: DbClient): Promise<AgentVerificationMetrics>;
}

// biome-ignore lint/suspicious/noExplicitAny: SQL projection varies by query; callers map/cast rows per use case.
type DbQueryRow = Record<string, any>;

export interface DbClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: DbQueryRow[]; rowCount?: number }>;
}
