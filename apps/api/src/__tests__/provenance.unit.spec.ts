import { ProvenanceServiceImpl } from '../services/provenance/provenanceService';

const buildFakeDb = () => {
  let eventSeq = 0;
  let summary: {
    draft_id: string;
    human_brief: string | null;
    human_brief_present: boolean;
    human_spark_score: number;
    agent_step_count: number;
    release_count: number;
    last_release_at: Date | null;
    authenticity_status: 'unverified' | 'metadata_only' | 'verified';
    created_at: Date;
    updated_at: Date;
  } | null = null;
  const events: Array<{
    id: number;
    draft_id: string;
    event_type: 'draft_created' | 'pr_merged' | 'draft_released';
    actor_id: string | null;
    payload: Record<string, unknown>;
    occurred_at: Date;
  }> = [];

  const query = jest.fn((sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO draft_provenance (draft_id)')) {
      if (!summary) {
        const now = new Date('2026-02-18T10:00:00.000Z');
        summary = {
          draft_id: params[0] as string,
          human_brief: null,
          human_brief_present: false,
          human_spark_score: 0,
          agent_step_count: 0,
          release_count: 0,
          last_release_at: null,
          authenticity_status: 'unverified',
          created_at: now,
          updated_at: now,
        };
      }
      return { rows: [] };
    }

    if (
      sql.includes('FROM draft_provenance') &&
      sql.includes('SELECT draft_id')
    ) {
      return { rows: summary ? [summary] : [] };
    }

    if (sql.includes('UPDATE draft_provenance')) {
      if (!summary) {
        throw new Error('summary not initialized');
      }
      if (sql.includes('agent_step_count = $2')) {
        summary = {
          ...summary,
          agent_step_count: Number(params[1]),
          authenticity_status: params[2] as
            | 'unverified'
            | 'metadata_only'
            | 'verified',
          human_spark_score: Number(params[3]),
          updated_at: new Date('2026-02-18T11:00:00.000Z'),
        };
      } else if (sql.includes('release_count = $4')) {
        summary = {
          ...summary,
          human_brief: summary.human_brief ?? (params[1] as string | null),
          human_brief_present: Boolean(params[2]),
          release_count: Number(params[3]),
          last_release_at: new Date('2026-02-18T12:00:00.000Z'),
          authenticity_status: params[4] as
            | 'unverified'
            | 'metadata_only'
            | 'verified',
          human_spark_score: Number(params[5]),
          updated_at: new Date('2026-02-18T12:00:00.000Z'),
        };
      } else {
        summary = {
          ...summary,
          human_brief: summary.human_brief ?? (params[1] as string | null),
          human_brief_present: Boolean(params[2]),
          authenticity_status: params[3] as
            | 'unverified'
            | 'metadata_only'
            | 'verified',
          human_spark_score: Number(params[4]),
          updated_at: new Date('2026-02-18T10:30:00.000Z'),
        };
      }
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO draft_provenance_events')) {
      eventSeq += 1;
      events.push({
        id: eventSeq,
        draft_id: params[0] as string,
        event_type: params[1] as
          | 'draft_created'
          | 'pr_merged'
          | 'draft_released',
        actor_id: (params[2] as string | null) ?? null,
        payload: JSON.parse(params[3] as string) as Record<string, unknown>,
        occurred_at: new Date(`2026-02-18T12:0${eventSeq}:00.000Z`),
      });
      return { rows: [] };
    }

    if (
      sql.includes('FROM draft_provenance_events') &&
      sql.includes('ORDER BY id ASC')
    ) {
      return { rows: events };
    }

    throw new Error(`Unexpected SQL in test fake DB: ${sql}`);
  });

  return { query };
};

describe('provenance service', () => {
  test('marks draft as traceable after creation with human brief', async () => {
    const fakeDb = buildFakeDb();
    const service = new ProvenanceServiceImpl(fakeDb as any);

    const summary = await service.recordDraftCreation(
      {
        draftId: 'draft-1',
        authorId: 'agent-1',
        metadata: { prompt: 'Design a clean hero section.' },
      },
      fakeDb as any,
    );

    expect(summary.humanBriefPresent).toBe(true);
    expect(summary.authenticityStatus).toBe('metadata_only');
    expect(summary.humanSparkScore).toBeGreaterThan(0);
  });

  test('upgrades provenance to verified after merge + release and exports trail', async () => {
    const fakeDb = buildFakeDb();
    const service = new ProvenanceServiceImpl(fakeDb as any);

    await service.recordDraftCreation(
      {
        draftId: 'draft-2',
        authorId: 'agent-2',
        metadata: { brief: 'Improve narrative coherence for campaign.' },
      },
      fakeDb as any,
    );
    await service.recordMergedPullRequest(
      {
        draftId: 'draft-2',
        pullRequestId: 'pr-2',
        makerId: 'agent-maker',
        severity: 'major',
        description: 'Adjusted typography and pacing.',
      },
      fakeDb as any,
    );
    const finalSummary = await service.recordDraftRelease(
      {
        draftId: 'draft-2',
        releaserId: 'agent-2',
      },
      fakeDb as any,
    );

    expect(finalSummary.authenticityStatus).toBe('verified');
    expect(finalSummary.releaseCount).toBe(1);
    expect(finalSummary.agentStepCount).toBe(1);

    const trail = await service.getTrail('draft-2', fakeDb as any);
    expect(trail.events).toHaveLength(3);
    expect(trail.events.map((item) => item.eventType)).toEqual([
      'draft_created',
      'pr_merged',
      'draft_released',
    ]);
  });
});
