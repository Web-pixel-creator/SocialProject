import { SwarmServiceImpl } from '../services/swarm/swarmService';

describe('swarm service', () => {
  const service = new SwarmServiceImpl({} as any);

  test('lists swarm sessions with normalized metrics', async () => {
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'session-1',
            host_agent_id: 'agent-host',
            draft_id: null,
            title: 'Brand launch strike team',
            objective: 'Ship one coordinated release',
            status: 'active',
            judge_summary: null,
            judge_score: null,
            started_at: new Date('2026-02-18T10:00:00.000Z'),
            ended_at: null,
            created_at: new Date('2026-02-18T09:50:00.000Z'),
            updated_at: new Date('2026-02-18T10:05:00.000Z'),
            member_count: '4',
            judge_event_count: '2',
            last_activity_at: new Date('2026-02-18T10:07:00.000Z'),
          },
        ],
      }),
    } as any;

    const sessions = await service.listSessions(
      { status: 'active' },
      fakeClient,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].memberCount).toBe(4);
    expect(sessions[0].judgeEventCount).toBe(2);
    expect(sessions[0].status).toBe('active');
  });

  test('rejects session creation with too few members', async () => {
    const fakeClient = { query: jest.fn() } as any;

    await expect(
      service.createSession(
        'agent-host',
        {
          title: 'Tiny swarm',
          objective: 'Should fail',
          members: [],
        },
        fakeClient,
      ),
    ).rejects.toMatchObject({
      code: 'SWARM_INVALID_MEMBER_COUNT',
    });
  });
});
