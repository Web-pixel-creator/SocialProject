import type { AIRuntimeRole } from '../aiRuntime/types';

const RUNTIME_ROLES: AIRuntimeRole[] = ['author', 'critic', 'maker', 'judge'];
const VALID_ROLE_SET = new Set<string>(RUNTIME_ROLES);

const MAX_CAPSULES_TOTAL = 12;
const MAX_GLOBAL_SKILLS = 6;
const MAX_ROLE_SKILLS = 4;
const MAX_LABEL_LENGTH = 48;
const MAX_INSTRUCTION_LENGTH = 240;
const MAX_TOTAL_CHAR_BUDGET = 2200;

export interface AgentSkillCapsule {
  label: string | null;
  instruction: string;
  roles: AIRuntimeRole[];
  source: 'skills' | 'globalSkills' | 'roleSkills';
}

export interface LoadedAgentSkillProfile {
  capsules: AgentSkillCapsule[];
  globalInstructions: string[];
  roleInstructions: Partial<Record<AIRuntimeRole, string[]>>;
  totalCount: number;
}

export interface AgentSkillsService {
  load(profile: unknown): LoadedAgentSkillProfile;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, ' ').trim();

const sanitizeText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const parseRoleArray = (value: unknown): AIRuntimeRole[] => {
  if (typeof value === 'string') {
    const normalized = normalizeWhitespace(value).toLowerCase();
    if (!normalized) {
      return [];
    }
    if (normalized === 'all') {
      return [...RUNTIME_ROLES];
    }
    return normalized
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry): entry is AIRuntimeRole => VALID_ROLE_SET.has(entry));
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeWhitespace(entry).toLowerCase())
    .flatMap((entry) => {
      if (!entry) {
        return [];
      }
      if (entry === 'all') {
        return [...RUNTIME_ROLES];
      }
      return [entry];
    })
    .filter((entry): entry is AIRuntimeRole => VALID_ROLE_SET.has(entry));
  return [...new Set(parsed)];
};

const collectStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const sanitized = sanitizeText(value, MAX_INSTRUCTION_LENGTH);
    return sanitized ? [sanitized] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => sanitizeText(entry, MAX_INSTRUCTION_LENGTH))
    .filter((entry): entry is string => Boolean(entry));
};

const buildCapsuleDedupKey = (
  scope: 'global' | AIRuntimeRole,
  instruction: string,
) => `${scope}:${instruction.toLowerCase()}`;

const pushScopedSkill = (
  target: string[],
  scope: 'global' | AIRuntimeRole,
  instruction: string,
  seen: Set<string>,
) => {
  const dedupKey = buildCapsuleDedupKey(scope, instruction);
  if (seen.has(dedupKey)) {
    return false;
  }
  seen.add(dedupKey);
  target.push(instruction);
  return true;
};

const rolePriority = (role: AIRuntimeRole) => RUNTIME_ROLES.indexOf(role);

export class AgentSkillsServiceImpl implements AgentSkillsService {
  load(profile: unknown): LoadedAgentSkillProfile {
    const record = isRecord(profile) ? profile : {};
    const capsules: AgentSkillCapsule[] = [];
    const globalInstructions: string[] = [];
    const roleInstructions: Partial<Record<AIRuntimeRole, string[]>> = {};
    const seen = new Set<string>();
    let totalChars = 0;

    const canAppend = (instruction: string) => {
      if (capsules.length >= MAX_CAPSULES_TOTAL) {
        return false;
      }
      if (totalChars + instruction.length > MAX_TOTAL_CHAR_BUDGET) {
        return false;
      }
      return true;
    };

    const appendGlobal = (
      instruction: string,
      source: AgentSkillCapsule['source'],
      label: string | null = null,
    ) => {
      if (globalInstructions.length >= MAX_GLOBAL_SKILLS) {
        return;
      }
      if (!canAppend(instruction)) {
        return;
      }
      if (!pushScopedSkill(globalInstructions, 'global', instruction, seen)) {
        return;
      }
      totalChars += instruction.length;
      capsules.push({
        label,
        instruction,
        roles: [],
        source,
      });
    };

    const appendRole = (
      role: AIRuntimeRole,
      instruction: string,
      source: AgentSkillCapsule['source'],
      label: string | null = null,
    ) => {
      const bucket = roleInstructions[role] ?? [];
      if (bucket.length >= MAX_ROLE_SKILLS) {
        roleInstructions[role] = bucket;
        return;
      }
      if (!canAppend(instruction)) {
        roleInstructions[role] = bucket;
        return;
      }
      if (!pushScopedSkill(bucket, role, instruction, seen)) {
        roleInstructions[role] = bucket;
        return;
      }
      totalChars += instruction.length;
      roleInstructions[role] = bucket;
      capsules.push({
        label,
        instruction,
        roles: [role],
        source,
      });
    };

    const skillsRaw = Array.isArray(record.skills) ? record.skills : [];
    for (const entry of skillsRaw) {
      if (!isRecord(entry)) {
        continue;
      }
      const instruction =
        sanitizeText(entry.instruction, MAX_INSTRUCTION_LENGTH) ??
        sanitizeText(entry.text, MAX_INSTRUCTION_LENGTH) ??
        sanitizeText(entry.prompt, MAX_INSTRUCTION_LENGTH);
      if (!instruction) {
        continue;
      }
      const label =
        sanitizeText(entry.label, MAX_LABEL_LENGTH) ??
        sanitizeText(entry.name, MAX_LABEL_LENGTH) ??
        sanitizeText(entry.id, MAX_LABEL_LENGTH);
      const roles = parseRoleArray(entry.appliesToRoles ?? entry.roles);
      if (roles.length === 0) {
        appendGlobal(instruction, 'skills', label);
        continue;
      }
      for (const role of [...roles].sort(
        (left, right) => rolePriority(left) - rolePriority(right),
      )) {
        appendRole(role, instruction, 'skills', label);
      }
    }

    for (const instruction of collectStringArray(record.globalSkills)) {
      appendGlobal(instruction, 'globalSkills');
    }

    const roleSkillsRaw = isRecord(record.roleSkills) ? record.roleSkills : {};
    for (const role of RUNTIME_ROLES) {
      for (const instruction of collectStringArray(roleSkillsRaw[role])) {
        appendRole(role, instruction, 'roleSkills');
      }
    }

    return {
      capsules,
      globalInstructions,
      roleInstructions,
      totalCount: capsules.length,
    };
  }
}

export const agentSkillsService = new AgentSkillsServiceImpl();
