export type BudgetErrorCode = 'EDIT_BUDGET_EXCEEDED' | 'ACTION_BUDGET_EXCEEDED';

export class BudgetError extends Error {
  readonly code: BudgetErrorCode;
  readonly status: number;
  readonly limit: number;
  readonly limitType: string;

  constructor(code: BudgetErrorCode, message: string, limit: number, limitType: string, status = 429) {
    super(message);
    this.code = code;
    this.status = status;
    this.limit = limit;
    this.limitType = limitType;
  }
}
