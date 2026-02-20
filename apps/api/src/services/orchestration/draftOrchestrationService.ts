import { db } from '../../db/pool';
import { agentGatewayService } from '../agentGateway/agentGatewayService';
import type { AgentGatewayService } from '../agentGateway/types';
import { aiRuntimeService } from '../aiRuntime/aiRuntimeService';
import type {
  AIRuntimeResult,
  AIRuntimeRole,
  AIRuntimeService,
} from '../aiRuntime/types';
import { ServiceError } from '../common/errors';

interface DraftOrchestrationStep {
  role: AIRuntimeRole;
  prompt: string;
  result: AIRuntimeResult;
}

interface StudioSkillContext {
  studioId: string;
  studioName: string;
  personality: string;
  styleTags: string[];
  skillProfile: Record<string, unknown>;
}

interface Queryable {
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface DraftOrchestrationRunInput {
  draftId: string;
  channel?: string;
  externalSessionId?: string;
  promptSeed?: string;
  hostAgentId?: string | null;
  metadata?: Record<string, unknown>;
  onStep?: (signal: DraftOrchestrationStepSignal) => Promise<void> | void;
  onCompleted?: (
    signal: DraftOrchestrationCompletedSignal,
  ) => Promise<void> | void;
}

export interface DraftOrchestrationRunResult {
  sessionId: string;
  channel: string;
  externalSessionId: string | null;
  draftId: string;
  completed: boolean;
  studioContext: StudioSkillContext | null;
  steps: DraftOrchestrationStep[];
}

export interface DraftOrchestrationStepSignal {
  sessionId: string;
  draftId: string;
  role: AIRuntimeRole;
  result: AIRuntimeResult;
}

export interface DraftOrchestrationCompletedSignal {
  sessionId: string;
  draftId: string;
  completed: boolean;
  stepCount: number;
}

const DEFAULT_CHANNEL = 'draft_cycle';
const CYCLE_ROLES: AIRuntimeRole[] = ['critic', 'maker', 'judge'];

const toNormalized = (value: string) => value.trim().toLowerCase();

const toPromptExcerpt = (value: string | null) => {
  if (!value) {
    return '';
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 320) {
    return normalized;
  }
  return `${normalized.slice(0, 317)}...`;
};

const toTrimmedString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
    } catch {
      return [];
    }
  }
  return [];
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toJsonPreview = (value: unknown, maxLength = 260) => {
  try {
    const json = JSON.stringify(value);
    if (json.length <= maxLength) {
      return json;
    }
    return `${json.slice(0, maxLength - 3)}...`;
  } catch {
    return '{}';
  }
};

const resolveSkillText = (
  profile: Record<string, unknown>,
  key: string,
): string | null => toTrimmedString(profile[key]);

const resolveSkillList = (profile: Record<string, unknown>, key: string) => {
  return toStringArray(profile[key])
    .map((item) => item.trim())
    .filter(Boolean);
};

const buildStudioContextLines = (studioContext: StudioSkillContext | null) => {
  if (!studioContext) {
    return [];
  }
  const tone = resolveSkillText(studioContext.skillProfile, 'tone');
  const forbiddenTerms = resolveSkillList(
    studioContext.skillProfile,
    'forbiddenTerms',
  );
  const preferredPatterns = resolveSkillList(
    studioContext.skillProfile,
    'preferredPatterns',
  );
  const judgeRubric = resolveSkillText(
    studioContext.skillProfile,
    'judgeRubric',
  );
  const skillProfileFallback =
    Object.keys(studioContext.skillProfile).length > 0
      ? toJsonPreview(studioContext.skillProfile)
      : null;

  return [
    `Studio context: ${studioContext.studioName}.`,
    `Studio personality: ${studioContext.personality}.`,
    studioContext.styleTags.length > 0
      ? `Studio style tags: ${studioContext.styleTags.join(', ')}.`
      : null,
    tone ? `Skill profile tone: ${tone}.` : null,
    forbiddenTerms.length > 0
      ? `Skill forbidden terms: ${forbiddenTerms.join(', ')}.`
      : null,
    preferredPatterns.length > 0
      ? `Skill preferred patterns: ${preferredPatterns.join(', ')}.`
      : null,
    judgeRubric ? `Skill judge rubric: ${judgeRubric}.` : null,
    !(
      tone ||
      forbiddenTerms.length ||
      preferredPatterns.length ||
      judgeRubric
    ) && skillProfileFallback
      ? `Skill profile JSON: ${skillProfileFallback}.`
      : null,
    'Keep output aligned with studio voice and style.',
  ].filter((part): part is string => Boolean(part));
};

const buildPrompt = (
  role: AIRuntimeRole,
  input: DraftOrchestrationRunInput,
  previousOutputs: Partial<Record<AIRuntimeRole, string | null>>,
  studioContext: StudioSkillContext | null,
) => {
  const seed = input.promptSeed?.trim();
  const contextLines = buildStudioContextLines(studioContext);
  if (role === 'critic') {
    return [
      `You are role=${role}.`,
      `Analyze draftId=${input.draftId}.`,
      ...contextLines,
      seed ? `Scenario seed: ${seed}` : null,
      'Return a concise fix request and severity.',
    ]
      .filter((part): part is string => Boolean(part))
      .join('\n');
  }

  if (role === 'maker') {
    return [
      `You are role=${role}.`,
      `Implement update plan for draftId=${input.draftId}.`,
      ...contextLines,
      `Critic output: ${toPromptExcerpt(previousOutputs.critic ?? null)}`,
      'Return proposed PR summary and expected improvement.',
    ].join('\n');
  }

  return [
    `You are role=${role}.`,
    `Review the cycle for draftId=${input.draftId}.`,
    ...contextLines,
    `Critic output: ${toPromptExcerpt(previousOutputs.critic ?? null)}`,
    `Maker output: ${toPromptExcerpt(previousOutputs.maker ?? null)}`,
    'Return merge/reject recommendation with confidence score 0..1.',
  ].join('\n');
};

const getNextRole = (role: AIRuntimeRole): string => {
  if (role === 'critic') {
    return 'maker';
  }
  if (role === 'maker') {
    return 'judge';
  }
  return 'author';
};

const safeInvoke = async <T>(
  hook: ((value: T) => Promise<void> | void) | undefined,
  payload: T,
) => {
  if (!hook) {
    return;
  }
  try {
    await hook(payload);
  } catch {
    // Keep orchestration flow deterministic even when external observers fail.
  }
};

export class DraftOrchestrationServiceImpl {
  private readonly gateway: AgentGatewayService;
  private readonly runtime: AIRuntimeService;
  private readonly queryable: Queryable;

  constructor(
    gateway: AgentGatewayService = agentGatewayService,
    runtime: AIRuntimeService = aiRuntimeService,
    queryable: Queryable = db,
  ) {
    this.gateway = gateway;
    this.runtime = runtime;
    this.queryable = queryable;
  }

  async run(
    input: DraftOrchestrationRunInput,
  ): Promise<DraftOrchestrationRunResult> {
    const draftId = input.draftId.trim();
    if (!draftId) {
      throw new ServiceError(
        'DRAFT_ORCHESTRATION_DRAFT_REQUIRED',
        'draftId is required.',
        400,
      );
    }

    const studioContext = await this.resolveStudioContext(input);

    const channel =
      toNormalized(input.channel ?? DEFAULT_CHANNEL) || DEFAULT_CHANNEL;
    const externalSessionId =
      input.externalSessionId?.trim() ||
      `${draftId}:${new Date().toISOString()}`;
    const session = this.gateway.ensureExternalSession({
      channel,
      externalSessionId,
      draftId,
      roles: ['author', ...CYCLE_ROLES],
      metadata: {
        source: 'draft_orchestration',
        hostAgentId: input.hostAgentId ?? null,
        studioId: studioContext?.studioId ?? null,
        studioName: studioContext?.studioName ?? null,
        styleTags: studioContext?.styleTags ?? [],
        skillProfile: studioContext?.skillProfile ?? {},
        ...(input.metadata ?? {}),
      },
    });

    await this.gateway.persistSession(session);

    const startedEvent = this.gateway.appendEvent(session.id, {
      fromRole: 'author',
      toRole: 'critic',
      type: 'draft_cycle_started',
      payload: {
        draftId,
        externalSessionId,
        channel,
        studioId: studioContext?.studioId ?? null,
        studioName: studioContext?.studioName ?? null,
        skillProfile: studioContext?.skillProfile ?? {},
      },
    });
    await this.gateway.persistEvent(startedEvent);
    await this.gateway.persistSession(
      this.gateway.getSession(session.id).session,
    );

    const steps: DraftOrchestrationStep[] = [];
    const outputs: Partial<Record<AIRuntimeRole, string | null>> = {};
    let completed = true;

    for (const role of CYCLE_ROLES) {
      const prompt = buildPrompt(role, input, outputs, studioContext);
      const result = await this.runtime.runWithFailover({
        role,
        prompt,
      });
      steps.push({ role, prompt, result });
      outputs[role] = result.output;

      const event = this.gateway.appendEvent(session.id, {
        fromRole: role,
        toRole: getNextRole(role),
        type: `draft_cycle_${role}_completed`,
        payload: {
          failed: result.failed,
          selectedProvider: result.selectedProvider,
          attempts: result.attempts,
          output: result.output,
        },
      });
      await this.gateway.persistEvent(event);
      await this.gateway.persistSession(
        this.gateway.getSession(session.id).session,
      );
      await safeInvoke(input.onStep, {
        sessionId: session.id,
        draftId,
        role,
        result,
      });

      if (result.failed) {
        completed = false;
        break;
      }
    }

    const finishEvent = this.gateway.appendEvent(session.id, {
      fromRole: completed ? 'judge' : 'author',
      toRole: 'author',
      type: completed ? 'draft_cycle_completed' : 'draft_cycle_failed',
      payload: {
        draftId,
        externalSessionId,
        channel,
        stepCount: steps.length,
      },
    });
    await this.gateway.persistEvent(finishEvent);

    const closedSession = this.gateway.closeSession(session.id);
    await this.gateway.persistSession(closedSession);
    await safeInvoke(input.onCompleted, {
      sessionId: session.id,
      draftId,
      completed,
      stepCount: steps.length,
    });

    return {
      sessionId: session.id,
      channel,
      externalSessionId,
      draftId,
      completed,
      studioContext,
      steps,
    };
  }

  private async resolveStudioContext(
    input: DraftOrchestrationRunInput,
  ): Promise<StudioSkillContext | null> {
    const draftQuery = await this.queryable.query(
      `SELECT
         a.id,
         a.studio_name,
         a.personality,
         a.style_tags,
         a.skill_profile
       FROM drafts d
       JOIN agents a ON a.id = d.author_id
       WHERE d.id = $1
       LIMIT 1`,
      [input.draftId],
    );
    const draftContext = this.mapStudioRow(draftQuery.rows[0]);
    if (draftContext) {
      return draftContext;
    }

    const hostAgentId = toTrimmedString(input.hostAgentId);
    if (!hostAgentId) {
      return null;
    }
    const hostQuery = await this.queryable.query(
      `SELECT id, studio_name, personality, style_tags, skill_profile
       FROM agents
       WHERE id = $1
       LIMIT 1`,
      [hostAgentId],
    );
    return this.mapStudioRow(hostQuery.rows[0]);
  }

  private mapStudioRow(
    row: Record<string, unknown> | undefined,
  ): StudioSkillContext | null {
    if (!row) {
      return null;
    }
    const studioId = toTrimmedString(row.id);
    const studioName = toTrimmedString(row.studio_name);
    const personality = toTrimmedString(row.personality);
    if (!(studioId && studioName && personality)) {
      return null;
    }
    return {
      studioId,
      studioName,
      personality,
      styleTags: toStringArray(row.style_tags),
      skillProfile: toRecord(row.skill_profile),
    };
  }
}

export const draftOrchestrationService = new DraftOrchestrationServiceImpl();
