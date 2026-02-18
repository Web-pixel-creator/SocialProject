import { LiveSessionServiceImpl } from '../services/liveSession/liveSessionService';

describe('live session service', () => {
  const service = new LiveSessionServiceImpl({} as any);

  test('lists live sessions with normalized counters', async () => {
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'live-1',
            host_agent_id: 'agent-host',
            draft_id: 'draft-1',
            title: 'Observer stream',
            objective: 'Run collaborative polish in public',
            status: 'live',
            is_public: true,
            recap_summary: null,
            started_at: new Date('2026-02-18T10:00:00.000Z'),
            ended_at: null,
            created_at: new Date('2026-02-18T09:40:00.000Z'),
            updated_at: new Date('2026-02-18T10:05:00.000Z'),
            participant_count: '12',
            message_count: '30',
            last_activity_at: new Date('2026-02-18T10:08:00.000Z'),
          },
        ],
      }),
    } as any;

    const sessions = await service.listSessions(
      { status: 'live', limit: 3 },
      fakeClient,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('live');
    expect(sessions[0].participantCount).toBe(12);
    expect(sessions[0].messageCount).toBe(30);
  });

  test('rejects session creation with missing title/objective', async () => {
    const fakeClient = { query: jest.fn() } as any;

    await expect(
      service.createSession(
        'agent-host',
        {
          title: '   ',
          objective: '',
        },
        fakeClient,
      ),
    ).rejects.toMatchObject({
      code: 'LIVE_SESSION_INVALID_INPUT',
    });
  });

  test('auto-generates recap summary and clip on completion when input recap is omitted', async () => {
    const localService = new LiveSessionServiceImpl({} as any);
    const now = new Date('2026-02-18T11:00:00.000Z');
    const sessionBefore = {
      session: {
        id: 'live-1',
        hostAgentId: 'agent-host',
        draftId: 'draft-1',
        title: 'Observer stream',
        objective: 'Run collaborative polish in public',
        status: 'live',
        isPublic: true,
        recapSummary: null,
        recapClipUrl: null,
        startedAt: now,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
        participantCount: 2,
        messageCount: 2,
        lastActivityAt: now,
      },
      presence: [
        {
          id: 'presence-human',
          sessionId: 'live-1',
          participantType: 'human',
          participantId: 'observer-1',
          status: 'watching',
          joinedAt: now,
          lastSeenAt: now,
        },
        {
          id: 'presence-agent',
          sessionId: 'live-1',
          participantType: 'agent',
          participantId: 'agent-host',
          status: 'active',
          joinedAt: now,
          lastSeenAt: now,
        },
      ],
      messages: [
        {
          id: 'message-1',
          sessionId: 'live-1',
          authorType: 'human',
          authorId: 'observer-1',
          authorLabel: 'Observer',
          content: 'I vote merge after this pass.',
          createdAt: now,
        },
        {
          id: 'message-2',
          sessionId: 'live-1',
          authorType: 'agent',
          authorId: 'agent-host',
          authorLabel: 'Host Agent',
          content: 'Ready to ship if no blockers remain.',
          createdAt: now,
        },
      ],
    } as any;
    const sessionAfter = {
      ...sessionBefore,
      session: {
        ...sessionBefore.session,
        status: 'completed',
      },
    } as any;

    const getSessionMock = jest
      .spyOn(localService, 'getSession')
      .mockResolvedValueOnce(sessionBefore)
      .mockResolvedValueOnce(sessionAfter);

    const fakeClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any;

    const detail = await localService.completeSession(
      'live-1',
      'agent-host',
      {},
      fakeClient,
    );

    expect(detail.session.status).toBe('completed');
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE live_studio_sessions'),
      expect.arrayContaining([
        'live-1',
        expect.stringContaining('Auto recap:'),
        expect.stringContaining('https://cdn.finishit.local/live-recaps/'),
      ]),
    );

    getSessionMock.mockRestore();
  });
});
