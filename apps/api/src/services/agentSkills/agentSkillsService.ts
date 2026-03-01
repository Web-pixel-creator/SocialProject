import fs from 'node:fs';
import path from 'node:path';
import type { AIRuntimeRole } from '../aiRuntime/types';

const RUNTIME_ROLES: AIRuntimeRole[] = ['author', 'critic', 'maker', 'judge'];
const VALID_ROLE_SET = new Set<string>(RUNTIME_ROLES);

const MAX_CAPSULES_TOTAL = 12;
const MAX_GLOBAL_SKILLS = 6;
const MAX_ROLE_SKILLS = 4;
const MAX_FILE_SKILLS = 6;
const MAX_SKILL_AUTODISCOVERY_DEPTH = 4;
const MAX_LABEL_LENGTH = 48;
const MAX_INSTRUCTION_LENGTH = 240;
const MAX_TOTAL_CHAR_BUDGET = 2200;
const MAX_FILE_CONTENT_LENGTH = 12_000;
const MAX_FILE_LINES = 24;
const DEFAULT_AUTOLOAD_ROOT = '.agent/skills';
const SKILL_FILE_EXTENSION_ALLOWLIST = new Set(['.md', '.txt']);
const MARKDOWN_HEADING_PREFIX_PATTERN = /^#{1,6}\s+/;
const MARKDOWN_QUOTE_PREFIX_PATTERN = /^>\s+/;
const MARKDOWN_BULLET_PREFIX_PATTERN = /^[-*+]\s+/;
const MARKDOWN_NUMBERED_PREFIX_PATTERN = /^\d+[.)]\s+/;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKDOWN_INLINE_CODE_PATTERN = /`{1,3}([^`]+)`{1,3}/g;
const NEWLINE_SPLIT_PATTERN = /\r?\n/;

export interface AgentSkillCapsule {
  label: string | null;
  instruction: string;
  roles: AIRuntimeRole[];
  source: 'skills' | 'globalSkills' | 'roleSkills' | 'skillFiles';
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

export interface AgentSkillsServiceDependencies {
  skillsRoot: string;
  readTextFile: (absolutePath: string) => string;
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

interface SkillFileEntry {
  filePath: string;
  label: string | null;
  roles: AIRuntimeRole[];
}

interface SkillAutoLoadConfig {
  enabled: boolean;
  maxFiles: number;
  rootPath: string;
}

const sanitizeSkillLine = (line: string) => {
  const withoutMarkdownDecorators = line
    .replace(MARKDOWN_HEADING_PREFIX_PATTERN, '')
    .replace(MARKDOWN_QUOTE_PREFIX_PATTERN, '')
    .replace(MARKDOWN_BULLET_PREFIX_PATTERN, '')
    .replace(MARKDOWN_NUMBERED_PREFIX_PATTERN, '')
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(MARKDOWN_INLINE_CODE_PATTERN, '$1')
    .trim();
  return normalizeWhitespace(withoutMarkdownDecorators);
};

const extractSkillInstructionFromFile = (content: string): string | null => {
  const normalizedContent =
    content.length <= MAX_FILE_CONTENT_LENGTH
      ? content
      : content.slice(0, MAX_FILE_CONTENT_LENGTH);
  const lines = normalizedContent.split(NEWLINE_SPLIT_PATTERN);
  const chunks: string[] = [];
  let inCodeBlock = false;

  for (const rawLine of lines) {
    if (chunks.length >= MAX_FILE_LINES) {
      break;
    }
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || trimmed.length === 0) {
      continue;
    }
    const sanitized = sanitizeSkillLine(trimmed);
    if (sanitized.length === 0) {
      continue;
    }
    chunks.push(sanitized);
  }

  return sanitizeText(chunks.join(' '), MAX_INSTRUCTION_LENGTH);
};

const parseSkillFileEntries = (profile: Record<string, unknown>) => {
  let rawEntries: unknown[] = [];
  if (Array.isArray(profile.skillFiles)) {
    rawEntries = profile.skillFiles;
  } else if (Array.isArray(profile.skillFilePaths)) {
    rawEntries = profile.skillFilePaths;
  }
  const entries: SkillFileEntry[] = [];
  for (const entry of rawEntries) {
    if (entries.length >= MAX_FILE_SKILLS) {
      break;
    }
    if (typeof entry === 'string') {
      const filePath = entry.trim();
      if (!filePath) {
        continue;
      }
      entries.push({
        filePath,
        label: sanitizeText(path.basename(filePath), MAX_LABEL_LENGTH),
        roles: [],
      });
      continue;
    }
    if (!isRecord(entry)) {
      continue;
    }
    const filePath = sanitizeText(
      entry.path ?? entry.filePath ?? entry.file,
      260,
    );
    if (!filePath) {
      continue;
    }
    const label =
      sanitizeText(entry.label ?? entry.name, MAX_LABEL_LENGTH) ??
      sanitizeText(path.basename(filePath), MAX_LABEL_LENGTH);
    const roles = parseRoleArray(entry.roles ?? entry.appliesToRoles);
    entries.push({
      filePath,
      label,
      roles,
    });
  }
  return entries;
};

const parseSkillAutoLoadConfig = (
  profile: Record<string, unknown>,
): SkillAutoLoadConfig => {
  const runtime =
    profile.skillRuntime &&
    typeof profile.skillRuntime === 'object' &&
    !Array.isArray(profile.skillRuntime)
      ? (profile.skillRuntime as Record<string, unknown>)
      : {};

  const normalizeBoolean = (value: unknown) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  };

  const parseMaxFiles = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const bounded = Math.floor(value);
      return Math.min(Math.max(1, bounded), MAX_FILE_SKILLS);
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return Math.min(Math.max(1, parsed), MAX_FILE_SKILLS);
      }
    }
    return MAX_FILE_SKILLS;
  };

  const enabled =
    normalizeBoolean(profile.autoLoadSkillFiles) ||
    normalizeBoolean(runtime.autoLoadSkillFiles) ||
    normalizeBoolean(runtime.autoLoadFiles);
  const rootPath =
    sanitizeText(runtime.rootPath, 260) ??
    sanitizeText(profile.skillFilesRoot, 260) ??
    DEFAULT_AUTOLOAD_ROOT;
  const maxFiles = parseMaxFiles(
    runtime.maxFiles ?? profile.autoLoadSkillFilesMax,
  );

  return {
    enabled,
    maxFiles,
    rootPath,
  };
};

export class AgentSkillsServiceImpl implements AgentSkillsService {
  private readonly skillsRoot: string;
  private readonly readTextFile: AgentSkillsServiceDependencies['readTextFile'];

  constructor(dependencies: Partial<AgentSkillsServiceDependencies> = {}) {
    this.skillsRoot =
      dependencies.skillsRoot?.trim() ||
      process.env.AGENT_SKILLS_ROOT?.trim() ||
      process.cwd();
    this.readTextFile =
      dependencies.readTextFile ??
      ((absolutePath: string) => fs.readFileSync(absolutePath, 'utf8'));
  }

  private resolveSafeFilePath(relativePath: string): string | null {
    const candidate = relativePath.trim();
    if (!candidate) {
      return null;
    }
    const normalizedCandidate = candidate.replace(/\\/g, '/');
    if (
      path.isAbsolute(normalizedCandidate) ||
      path.win32.isAbsolute(candidate)
    ) {
      return null;
    }
    const absoluteRoot = path.resolve(this.skillsRoot);
    const resolved = path.resolve(absoluteRoot, normalizedCandidate);
    if (
      !(
        resolved === absoluteRoot ||
        resolved.startsWith(`${absoluteRoot}${path.sep}`)
      )
    ) {
      return null;
    }
    const extension = path.extname(resolved).toLowerCase();
    if (!SKILL_FILE_EXTENSION_ALLOWLIST.has(extension)) {
      return null;
    }
    return resolved;
  }

  private resolveSafeDirectoryPath(relativePath: string): string | null {
    const candidate = relativePath.trim();
    if (!candidate) {
      return null;
    }
    const normalizedCandidate = candidate.replace(/\\/g, '/');
    if (
      path.isAbsolute(normalizedCandidate) ||
      path.win32.isAbsolute(candidate)
    ) {
      return null;
    }
    const absoluteRoot = path.resolve(this.skillsRoot);
    const resolved = path.resolve(absoluteRoot, normalizedCandidate);
    if (
      !(
        resolved === absoluteRoot ||
        resolved.startsWith(`${absoluteRoot}${path.sep}`)
      )
    ) {
      return null;
    }
    return resolved;
  }

  private inferRolesFromPath(relativePath: string): AIRuntimeRole[] {
    const segments = relativePath
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean);

    const roles = RUNTIME_ROLES.filter((role) =>
      segments.some(
        (segment) =>
          segment === role ||
          segment === `${role}s` ||
          segment === `${role}-skills` ||
          segment === `${role}_skills`,
      ),
    );

    return [...new Set(roles)];
  }

  private discoverAutoSkillFiles(
    profile: Record<string, unknown>,
  ): SkillFileEntry[] {
    const config = parseSkillAutoLoadConfig(profile);
    if (!config.enabled) {
      return [];
    }
    const autoloadRoot = this.resolveSafeDirectoryPath(config.rootPath);
    if (!autoloadRoot) {
      return [];
    }

    const rootAbsolute = path.resolve(this.skillsRoot);
    const queue: Array<{ absoluteDir: string; depth: number }> = [
      { absoluteDir: autoloadRoot, depth: 0 },
    ];
    const visitedDirs = new Set<string>([autoloadRoot]);
    const discovered: SkillFileEntry[] = [];

    while (queue.length > 0 && discovered.length < config.maxFiles) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(current.absoluteDir, { withFileTypes: true });
      } catch {
        continue;
      }

      entries.sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of entries) {
        if (discovered.length >= config.maxFiles) {
          break;
        }

        if (entry.isSymbolicLink()) {
          continue;
        }

        const absolutePath = path.resolve(current.absoluteDir, entry.name);
        if (entry.isDirectory()) {
          if (current.depth + 1 > MAX_SKILL_AUTODISCOVERY_DEPTH) {
            continue;
          }
          if (!visitedDirs.has(absolutePath)) {
            visitedDirs.add(absolutePath);
            queue.push({
              absoluteDir: absolutePath,
              depth: current.depth + 1,
            });
          }
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const fileName = entry.name.toLowerCase();
        const extension = path.extname(fileName);
        if (!SKILL_FILE_EXTENSION_ALLOWLIST.has(extension)) {
          continue;
        }
        if (!(fileName === 'skill.md' || fileName === 'skill.txt')) {
          continue;
        }

        const relativePath = path.relative(rootAbsolute, absolutePath);
        const normalizedRelativePath = relativePath.replace(/\\/g, '/');
        if (
          !normalizedRelativePath ||
          normalizedRelativePath.startsWith('..') ||
          path.isAbsolute(relativePath)
        ) {
          continue;
        }

        const parentLabel =
          sanitizeText(
            path.basename(path.dirname(absolutePath)),
            MAX_LABEL_LENGTH,
          ) ?? sanitizeText(path.basename(absolutePath), MAX_LABEL_LENGTH);

        discovered.push({
          filePath: normalizedRelativePath,
          label: parentLabel,
          roles: this.inferRolesFromPath(normalizedRelativePath),
        });
      }
    }

    return discovered;
  }

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

    const explicitSkillFiles = parseSkillFileEntries(record);
    const autoSkillFiles = this.discoverAutoSkillFiles(record);
    const combinedSkillFiles: SkillFileEntry[] = [];
    const seenSkillFileEntries = new Set<string>();
    for (const skillFile of [...explicitSkillFiles, ...autoSkillFiles]) {
      if (combinedSkillFiles.length >= MAX_FILE_SKILLS) {
        break;
      }
      const rolesKey = [...skillFile.roles].sort().join(',');
      const dedupeKey = `${skillFile.filePath.toLowerCase()}|${rolesKey}`;
      if (seenSkillFileEntries.has(dedupeKey)) {
        continue;
      }
      seenSkillFileEntries.add(dedupeKey);
      combinedSkillFiles.push(skillFile);
    }

    for (const skillFile of combinedSkillFiles) {
      const absolutePath = this.resolveSafeFilePath(skillFile.filePath);
      if (!absolutePath) {
        continue;
      }
      let instruction: string | null = null;
      try {
        instruction = extractSkillInstructionFromFile(
          this.readTextFile(absolutePath),
        );
      } catch {
        instruction = null;
      }
      if (!instruction) {
        continue;
      }
      if (skillFile.roles.length === 0) {
        appendGlobal(instruction, 'skillFiles', skillFile.label);
        continue;
      }
      for (const role of [...skillFile.roles].sort(
        (left, right) => rolePriority(left) - rolePriority(right),
      )) {
        appendRole(role, instruction, 'skillFiles', skillFile.label);
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
