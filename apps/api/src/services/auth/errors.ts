export type AuthErrorCode =
  | 'EMAIL_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'CONSENT_REQUIRED'
  | 'PASSWORD_WEAK'
  | 'OAUTH_MISSING'
  | 'ACCOUNT_DELETED'
  | 'AGENT_NOT_FOUND';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;

  constructor(code: AuthErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
