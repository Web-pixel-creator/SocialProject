import { db } from '../../db/pool';
import { agentGatewayService } from '../agentGateway/agentGatewayService';
import type { AgentGatewayService } from '../agentGateway/types';
import {
  AgentGatewayAdapterServiceImpl,
  agentGatewayAdapterService,
} from '../agentGatewayAdapter/agentGatewayAdapterService';
import type {
  AgentGatewayAdapterName,
  AgentGatewayAdapterService,
} from '../agentGatewayAdapter/types';
import type { LoadedAgentSkillProfile } from '../agentSkills/agentSkillsService';
import { agentSkillsService } from '../agentSkills/agentSkillsService';
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

interface RolePersonaConfig {
  tone?: string;
  signaturePhrase?: string;
  focus?: string[];
  boundaries?: string[];
}

type RolePersonas = Partial<Record<AIRuntimeRole, RolePersonaConfig>>;

interface StudioSkillContext {
  studioId: string;
  studioName: string;
  personality: string;
  styleTags: string[];
  skillProfile: Record<string, unknown>;
  rolePersonas: RolePersonas;
  loadedSkills: LoadedAgentSkillProfile;
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

const parseRolePersona = (value: unknown): RolePersonaConfig | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const personaRecord = value as Record<string, unknown>;
  const tone = toTrimmedString(personaRecord.tone) ?? undefined;
  const signaturePhrase =
    toTrimmedString(personaRecord.signaturePhrase) ?? undefined;
  const focus = toStringArray(personaRecord.focus)
    .map((item) => item.trim())
    .filter(Boolean);
  const boundaries = toStringArray(personaRecord.boundaries)
    .map((item) => item.trim())
    .filter(Boolean);
  const parsed: RolePersonaConfig = {};
  if (tone) {
    parsed.tone = tone;
  }
  if (signaturePhrase) {
    parsed.signaturePhrase = signaturePhrase;
  }
  if (focus.length > 0) {
    parsed.focus = focus;
  }
  if (boundaries.length > 0) {
    parsed.boundaries = boundaries;
  }
  return Object.keys(parsed).length > 0 ? parsed : null;
};

const parseRolePersonas = (profile: Record<string, unknown>): RolePersonas => {
  const rolePersonasRaw = profile.rolePersonas;
  if (
    !rolePersonasRaw ||
    typeof rolePersonasRaw !== 'object' ||
    Array.isArray(rolePersonasRaw)
  ) {
    return {};
  }
  const rolePersonasRecord = rolePersonasRaw as Record<string, unknown>;
  const parsed: RolePersonas = {};
  for (const role of [
    'author',
    'critic',
    'maker',
    'judge',
  ] as AIRuntimeRole[]) {
    const persona = parseRolePersona(rolePersonasRecord[role]);
    if (persona) {
      parsed[role] = persona;
    }
  }
  return parsed;
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
  const loadedGlobalSkillLines =
    studioContext.loadedSkills.globalInstructions.length > 0
      ? studioContext.loadedSkills.globalInstructions.map(
          (instruction) => `Skill capsule: ${instruction}.`,
        )
      : [];

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
    ...loadedGlobalSkillLines,
    'Keep output aligned with studio voice and style.',
  ].filter((part): part is string => Boolean(part));
};

const buildRolePersonaLines = (
  role: AIRuntimeRole,
  studioContext: StudioSkillContext | null,
) => {
  const rolePersona = studioContext?.rolePersonas?.[role];
  const roleSkillLines =
    studioContext?.loadedSkills.roleInstructions[role]?.map(
      (instruction) => `Role skill (${role}): ${instruction}.`,
    ) ?? [];
  if (!rolePersona) {
    return roleSkillLines;
  }
  const focus =
    rolePersona.focus && rolePersona.focus.length > 0
      ? rolePersona.focus.join(', ')
      : null;
  const boundaries =
    rolePersona.boundaries && rolePersona.boundaries.length > 0
      ? rolePersona.boundaries.join(', ')
      : null;

  return [
    rolePersona.tone
      ? `Role persona (${role}) tone: ${rolePersona.tone}.`
      : null,
    rolePersona.signaturePhrase
      ? `Role persona (${role}) signature phrase: ${rolePersona.signaturePhrase}.`
      : null,
    focus ? `Role persona (${role}) focus: ${focus}.` : null,
    boundaries ? `Role persona (${role}) boundaries: ${boundaries}.` : null,
    ...roleSkillLines,
    'Stay consistent with this role persona in wording and recommendations.',
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
  const rolePersonaLines = buildRolePersonaLines(role, studioContext);
  if (role === 'critic') {
    return [
      `You are role=${role}.`,
      `Analyze draftId=${input.draftId}.`,
      ...contextLines,
      ...rolePersonaLines,
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
      ...rolePersonaLines,
      `Critic output: ${toPromptExcerpt(previousOutputs.critic ?? null)}`,
      'Return proposed PR summary and expected improvement.',
    ].join('\n');
  }

  return [
    `You are role=${role}.`,
    `Review the cycle for draftId=${input.draftId}.`,
    ...contextLines,
    ...rolePersonaLines,
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

const resolveAdapterForChannel = (channel: string): AgentGatewayAdapterName => {
  const normalized = toNormalized(channel);
  if (normalized === 'live_session') {
    return 'live_session';
  }
  if (
    normalized === 'draft_cycle' ||
    normalized === 'ws-control-plane' ||
    normalized === 'web'
  ) {
    return 'web';
  }
  return 'external_webhook';
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
  private readonly adapterRouter: AgentGatewayAdapterService;
  private readonly runtime: AIRuntimeService;
  private readonly queryable: Queryable;

  constructor(
    gateway: AgentGatewayService = agentGatewayService,
    runtime: AIRuntimeService = aiRuntimeService,
    queryable: Queryable = db,
    adapterRouter?: AgentGatewayAdapterService,
  ) {
    this.gateway = gateway;
    this.runtime = runtime;
    this.queryable = queryable;
    this.adapterRouter =
      adapterRouter ??
      (gateway === agentGatewayService && queryable === db
        ? agentGatewayAdapterService
        : new AgentGatewayAdapterServiceImpl({
            gateway,
            queryable,
          }));
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
    const adapter = resolveAdapterForChannel(channel);
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

    await this.adapterRouter.appendSessionEvent({
      adapter,
      sessionId: session.id,
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
      persist: true,
    });
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

      await this.adapterRouter.appendSessionEvent({
        adapter,
        sessionId: session.id,
        fromRole: role,
        toRole: getNextRole(role),
        type: `draft_cycle_${role}_completed`,
        payload: {
          failed: result.failed,
          selectedProvider: result.selectedProvider,
          attempts: result.attempts,
          output: result.output,
        },
        persist: true,
      });
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

    await this.adapterRouter.appendSessionEvent({
      adapter,
      sessionId: session.id,
      fromRole: completed ? 'judge' : 'author',
      toRole: 'author',
      type: completed ? 'draft_cycle_completed' : 'draft_cycle_failed',
      payload: {
        draftId,
        externalSessionId,
        channel,
        stepCount: steps.length,
      },
      persist: true,
    });
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
    const skillProfile = toRecord(row.skill_profile);
    const loadedSkills = agentSkillsService.load(skillProfile);
    return {
      studioId,
      studioName,
      personality,
      styleTags: toStringArray(row.style_tags),
      skillProfile,
      rolePersonas: parseRolePersonas(skillProfile),
      loadedSkills,
    };
  }
}

export const draftOrchestrationService = new DraftOrchestrationServiceImpl();
