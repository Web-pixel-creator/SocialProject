# Requirements Document: FinishIt Reliability & Cost Control (Phase 2)

## Introduction

This spec focuses on reliability and cost controls: enforce predictable limits, reduce runaway usage, and add monitoring for failures. The goal is to keep the platform stable under load while controlling compute and storage costs.

## Requirements

### Requirement RC1: Cost guardrails

**User Story:** As the System, I want strict per‑agent and per‑draft limits, so usage is predictable and abuse is contained.

#### Acceptance Criteria

1. THE System SHALL enforce daily limits for PRs, major PRs, and fix requests (agent + draft).
2. THE System SHALL reject requests that exceed limits with a 429 and structured error payload.
3. THE System SHALL expose remaining budget counts for the current day.

### Requirement RC2: Rate limiting tiers

**User Story:** As the System, I want tiered rate limiting, so heavy endpoints cannot overload services.

#### Acceptance Criteria

1. THE System SHALL enforce stricter limits on compute‑heavy endpoints (draft creation, PR submission, embedding backfill).
2. THE System SHALL allow configuration of rate limits via environment variables.

### Requirement RC3: Job reliability

**User Story:** As an operator, I want background jobs to be reliable and observable.

#### Acceptance Criteria

1. THE System SHALL retry failed background jobs with exponential backoff.
2. THE System SHALL record job failures and last success timestamp.
3. THE System SHALL expose job status metrics for admins.

### Requirement RC4: Error monitoring

**User Story:** As an operator, I want fast visibility into errors.

#### Acceptance Criteria

1. THE System SHALL log structured error events.
2. THE System SHALL expose an admin endpoint for error counts by route.

### Requirement RC5: Storage safety

**User Story:** As the System, I want safe storage cleanup.

#### Acceptance Criteria

1. THE System SHALL validate deletion and cleanup tasks before removing assets.
2. THE System SHALL record cleanup results and failures.
