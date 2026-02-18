import { CreatorStudioServiceImpl } from '../services/creatorStudio/creatorStudioService';

describe('creator studio service', () => {
  test('creates creator studio and records onboarding profile completion event', async () => {
    const service = new CreatorStudioServiceImpl({} as any);
    let eventInserts = 0;

    const fakeClient = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO creator_studios')) {
          return {
            rows: [
              {
                id: 'studio-1',
                owner_user_id: 'user-1',
                studio_name: 'Pixel Forge',
                tagline: 'Visual-native studio',
                style_preset: 'balanced',
                governance: {
                  autoApproveThreshold: 0.75,
                  majorPrRequiresHuman: true,
                  allowForks: true,
                  moderationMode: 'balanced',
                },
                revenue_share_percent: '15',
                status: 'draft',
                onboarding_step: 'profile',
                onboarding_completed_at: null,
                retention_score: '0',
                created_at: new Date('2026-02-18T10:00:00.000Z'),
                updated_at: new Date('2026-02-18T10:00:00.000Z'),
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO creator_studio_events')) {
          eventInserts += 1;
          return { rows: [] };
        }
        if (sql.includes('FROM creator_studios s')) {
          return {
            rows: [
              {
                id: 'studio-1',
                owner_user_id: 'user-1',
                studio_name: 'Pixel Forge',
                tagline: 'Visual-native studio',
                style_preset: 'balanced',
                governance: {
                  autoApproveThreshold: 0.75,
                  majorPrRequiresHuman: true,
                  allowForks: true,
                  moderationMode: 'balanced',
                },
                revenue_share_percent: '15',
                status: 'draft',
                onboarding_step: 'profile',
                onboarding_completed_at: null,
                retention_score: '0',
                created_at: new Date('2026-02-18T10:00:00.000Z'),
                updated_at: new Date('2026-02-18T10:00:00.000Z'),
                last_event_at: new Date('2026-02-18T10:01:00.000Z'),
              },
            ],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as any;

    const studio = await service.createStudio(
      'user-1',
      {
        studioName: 'Pixel Forge',
        tagline: 'Visual-native studio',
      },
      fakeClient,
    );

    expect(studio.studioName).toBe('Pixel Forge');
    expect(studio.governance.autoApproveThreshold).toBeCloseTo(0.75);
    expect(eventInserts).toBe(2);
  });

  test('rejects governance threshold outside 0..1', async () => {
    const service = new CreatorStudioServiceImpl({} as any);

    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'studio-1',
            owner_user_id: 'user-1',
            studio_name: 'Pixel Forge',
            tagline: '',
            style_preset: 'balanced',
            governance: {
              autoApproveThreshold: 0.75,
              majorPrRequiresHuman: true,
              allowForks: true,
              moderationMode: 'balanced',
            },
            revenue_share_percent: '15',
            status: 'draft',
            onboarding_step: 'profile',
            onboarding_completed_at: null,
            retention_score: '0',
            created_at: new Date('2026-02-18T10:00:00.000Z'),
            updated_at: new Date('2026-02-18T10:00:00.000Z'),
            last_event_at: new Date('2026-02-18T10:01:00.000Z'),
          },
        ],
      }),
    } as any;

    await expect(
      service.updateGovernance(
        'studio-1',
        'user-1',
        {
          governance: {
            autoApproveThreshold: 1.2,
          },
        },
        fakeClient,
      ),
    ).rejects.toMatchObject({
      code: 'CREATOR_STUDIO_INVALID_THRESHOLD',
    });
  });

  test('returns funnel summary with activation rate', async () => {
    const service = new CreatorStudioServiceImpl({} as any);
    const fakeClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { event_type: 'created', total: '10' },
          { event_type: 'governance_configured', total: '8' },
          { event_type: 'billing_connected', total: '6' },
          { event_type: 'activated', total: '5' },
          { event_type: 'retention_ping', total: '12' },
        ],
      }),
    } as any;

    const summary = await service.getFunnelSummary('user-1', 30, fakeClient);

    expect(summary.created).toBe(10);
    expect(summary.activated).toBe(5);
    expect(summary.activationRatePercent).toBe(50);
    expect(summary.retentionPing).toBe(12);
  });
});
