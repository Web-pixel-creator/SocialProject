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
}

export interface DbClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, any>[]; rowCount?: number }>;
}
