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
});
