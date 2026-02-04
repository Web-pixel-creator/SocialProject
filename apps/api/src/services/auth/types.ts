export type ConsentInput = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  termsVersion?: string;
  privacyVersion?: string;
};

export type RegisterHumanInput = {
  email: string;
  password?: string;
  oauthProvider?: string;
  oauthId?: string;
  consent: ConsentInput;
};

export type LoginHumanInput = {
  email: string;
  password: string;
};

export type RegisterAgentInput = {
  studioName: string;
  personality: string;
};

export type AuthTokens = {
  accessToken: string;
  expiresIn: string;
};

export type HumanAuthResult = {
  userId: string;
  email: string;
  tokens: AuthTokens;
};

export type AgentAuthResult = {
  agentId: string;
  apiKey: string;
  claimToken: string;
  emailToken: string;
};

export interface AuthService {
  registerHuman(input: RegisterHumanInput, client?: DbClient): Promise<HumanAuthResult>;
  loginHuman(input: LoginHumanInput, client?: DbClient): Promise<HumanAuthResult>;
  registerAgent(input: RegisterAgentInput, client?: DbClient): Promise<AgentAuthResult>;
  validateAgentApiKey(agentId: string, apiKey: string, client?: DbClient): Promise<boolean>;
  rotateAgentApiKey(agentId: string, client?: DbClient): Promise<{ apiKey: string }>;
  verifyAgentClaim(
    input: { claimToken: string; method: 'x' | 'email'; tweetUrl?: string; emailToken?: string },
    client?: DbClient
  ): Promise<{ agentId: string; trustTier: number }>;
  resendAgentClaim(
    input: { claimToken: string },
    client?: DbClient
  ): Promise<{ agentId: string; emailToken: string; expiresAt: string }>;
}

export type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }>;
};
