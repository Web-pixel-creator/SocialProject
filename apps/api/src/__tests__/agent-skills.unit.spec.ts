import path from 'node:path';
import { AgentSkillsServiceImpl } from '../services/agentSkills/agentSkillsService';

describe('agent skills service', () => {
  test('loads global and role-specific skill capsules with dedupe', () => {
    const service = new AgentSkillsServiceImpl();
    const loaded = service.load({
      skills: [
        {
          label: 'Narrative',
          instruction: '  Keep narrative coherence across revisions.  ',
        },
        {
          instruction: 'Reject low-contrast focal points',
          roles: ['critic'],
        },
        {
          instruction: 'Preserve texture detail in highlights',
          appliesToRoles: ['maker', 'judge'],
        },
      ],
      globalSkills: [
        'Prefer depth layering.',
        'Prefer depth layering.',
        'Avoid flat composition.',
      ],
      roleSkills: {
        critic: [
          'Flag generic composition shortcuts.',
          'Flag generic composition shortcuts.',
        ],
        judge: 'Require explicit merge rationale.',
      },
    });

    expect(loaded.globalInstructions).toEqual([
      'Keep narrative coherence across revisions.',
      'Prefer depth layering.',
      'Avoid flat composition.',
    ]);
    expect(loaded.roleInstructions.critic).toEqual([
      'Reject low-contrast focal points',
      'Flag generic composition shortcuts.',
    ]);
    expect(loaded.roleInstructions.maker).toEqual([
      'Preserve texture detail in highlights',
    ]);
    expect(loaded.roleInstructions.judge).toEqual([
      'Preserve texture detail in highlights',
      'Require explicit merge rationale.',
    ]);
    expect(loaded.totalCount).toBeGreaterThan(0);
  });

  test('enforces capsule and text bounds', () => {
    const service = new AgentSkillsServiceImpl();
    const oversizedInstruction = 'x'.repeat(500);
    const loaded = service.load({
      skills: Array.from({ length: 40 }).map((_, index) => ({
        name: `capsule-${index}`,
        instruction: `${oversizedInstruction}-${index}`,
      })),
    });

    expect(loaded.totalCount).toBeLessThanOrEqual(12);
    for (const capsule of loaded.capsules) {
      expect(capsule.instruction.length).toBeLessThanOrEqual(240);
    }
  });

  test('loads skills from safe markdown file entries', () => {
    const skillsRoot = path.resolve('c:/finishit-skill-root');
    const globalFile = path.resolve(skillsRoot, 'skills/global/SKILL.md');
    const criticFile = path.resolve(skillsRoot, 'skills/critic-guidelines.md');
    const readTextFile = jest.fn((absolutePath: string) => {
      if (absolutePath === globalFile) {
        return `# Global Studio Skill
Keep narrative coherence across revisions.
- Avoid noisy gradients.
\`\`\`ts
const ignore = true;
\`\`\`
`;
      }
      if (absolutePath === criticFile) {
        return `## Critic Lens
Prioritize contrast integrity in focal zones.
`;
      }
      throw new Error('unexpected file path');
    });
    const service = new AgentSkillsServiceImpl({ skillsRoot, readTextFile });

    const loaded = service.load({
      skillFiles: [
        'skills/global/SKILL.md',
        { path: 'skills/critic-guidelines.md', roles: ['critic'] },
      ],
    });

    expect(readTextFile).toHaveBeenCalledTimes(2);
    expect(loaded.globalInstructions[0]).toContain(
      'Keep narrative coherence across revisions.',
    );
    expect(loaded.globalInstructions[0]).toContain('Avoid noisy gradients.');
    expect(loaded.roleInstructions.critic?.[0]).toContain(
      'Prioritize contrast integrity in focal zones.',
    );
  });

  test('ignores unsafe or unsupported skill file paths', () => {
    const readTextFile = jest.fn(() => '# Should not be read');
    const service = new AgentSkillsServiceImpl({
      skillsRoot: path.resolve('c:/finishit-skill-root'),
      readTextFile,
    });

    const loaded = service.load({
      skillFiles: [
        '../secrets/SKILL.md',
        '/etc/passwd',
        'skills/raw.bin',
        { path: '..\\outside\\SKILL.md', roles: ['judge'] },
      ],
    });

    expect(readTextFile).not.toHaveBeenCalled();
    expect(loaded.totalCount).toBe(0);
  });
});
