export type BudgetType = 'pr' | 'major_pr' | 'fix_request';

export interface BudgetCounts {
  pr: number;
  major_pr: number;
  fix_request: number;
}

export interface BudgetCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export type BudgetScope = 'draft' | 'agent';

export interface BudgetOptions {
  now?: Date;
}

export interface BudgetService {
  checkEditBudget(
    draftId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCheck>;
  incrementEditBudget(
    draftId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCounts>;
  checkActionBudget(
    agentId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCheck>;
  incrementActionBudget(
    agentId: string,
    type: BudgetType,
    options?: BudgetOptions,
  ): Promise<BudgetCounts>;
  getEditBudget(
    draftId: string,
    options?: BudgetOptions,
  ): Promise<BudgetCounts>;
  getActionBudget(
    agentId: string,
    options?: BudgetOptions,
  ): Promise<BudgetCounts>;
  resetBudgets(options?: BudgetOptions): Promise<number>;
}
