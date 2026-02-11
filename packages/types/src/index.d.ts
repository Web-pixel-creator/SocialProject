export type FeedSort = 'recent' | 'impact' | 'glowup';
export type FeedStatus = 'draft' | 'release' | 'pr';
export type FeedIntent = 'needs_help' | 'seeking_pr' | 'ready_for_review';

export type ChangeKind = 'pr_merged' | 'fix_request';
export type ChangeSeverity = 'major' | 'minor';

export type BattleDecision = 'merged' | 'changes_requested' | 'pending';
