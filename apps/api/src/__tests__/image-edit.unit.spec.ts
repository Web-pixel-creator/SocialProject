jest.mock('sharp', () => {
  return () => ({
    resize: () => ({
      png: () => ({
        toBuffer: async () => Buffer.from('thumb'),
      }),
    }),
  });
});

import { ImageEditServiceImpl } from '../services/imageEdit/imageEditService';
import type { ProviderRoutingService } from '../services/providerRouting/types';
import type { PullRequestService } from '../services/pullRequest/types';
import type { StorageService } from '../services/storage/types';

describe('ImageEditServiceImpl', () => {
  const previousFalKey = process.env.FAL_API_KEY;

  const createRoute = () => ({
    budgetCapUsd: null,
    cacheEligible: false,
    disabledProviders: [],
    grounded: false,
    lane: 'image_edit' as const,
    providers: [
      {
        enabled: true,
        model: 'fal-ai/nano-banana-2/edit',
        provider: 'fal-nano-banana-2-edit',
        role: 'primary' as const,
      },
    ],
    requestedProviders: [],
    resolvedProviders: [
      {
        model: 'fal-ai/nano-banana-2/edit',
        provider: 'fal-nano-banana-2-edit',
        role: 'primary' as const,
      },
    ],
    stage: 'pilot' as const,
  });

  const createPool = (query: jest.Mock) =>
    ({
      connect: jest.fn().mockResolvedValue({
        query,
        release: jest.fn(),
      }),
      query,
    }) as any;

  afterEach(() => {
    if (previousFalKey === undefined) {
      delete process.env.FAL_API_KEY;
    } else {
      process.env.FAL_API_KEY = previousFalKey;
    }
    jest.restoreAllMocks();
  });

  test('submits fal image edit jobs and persists queued metadata', async () => {
    process.env.FAL_API_KEY = 'fal-test-key';
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM drafts d')) {
        return Promise.resolve({
          rows: [
            {
              current_version: 2,
              draft_id: 'draft-1',
              image_url: 'https://example.com/source.png',
              source_version_id: 'version-2',
              source_version_number: 2,
              status: 'draft',
            },
          ],
        });
      }
      if (sql.includes('INSERT INTO image_edit_jobs')) {
        return Promise.resolve({
          rows: [
            {
              aspect_ratio: '16:9',
              completed_at: null,
              created_at: new Date('2026-03-07T12:00:00.000Z'),
              draft_id: 'draft-1',
              failure_code: null,
              failure_message: null,
              id: 'job-1',
              last_synced_at: new Date('2026-03-07T12:00:01.000Z'),
              metadata: { route: createRoute() },
              model: 'fal-ai/nano-banana-2/edit',
              num_images: 2,
              prompt: 'Boost contrast and clean the logo lockup.',
              provider: 'fal-nano-banana-2-edit',
              provider_cancel_url:
                'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1/cancel',
              provider_request_id: 'req-1',
              provider_response_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1',
              provider_status: 'IN_QUEUE',
              provider_status_url:
                'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1/status',
              reference_image_urls: ['https://example.com/source.png'],
              requested_by_id: 'agent-1',
              requested_by_type: 'agent',
              source_version_id: 'version-2',
              source_version_number: 2,
              status: 'queued',
              updated_at: new Date('2026-03-07T12:00:00.000Z'),
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        cancel_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1/cancel',
        request_id: 'req-1',
        response_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1',
        status: 'IN_QUEUE',
        status_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1/status',
      }),
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);
    const service = new ImageEditServiceImpl({
      fetchImpl: fetchMock as unknown as typeof fetch,
      pool: createPool(query),
      providerRouting: {
        recordExecution,
        resolveRoute: jest.fn().mockReturnValue(createRoute()),
      } as unknown as ProviderRoutingService,
      storageService: {
        deleteObject: jest.fn(),
        generateSignedUrl: jest.fn(),
        uploadObject: jest.fn(),
        uploadVersion: jest.fn(),
      } as unknown as StorageService,
    });

    const result = await service.createJob({
      aspectRatio: '16:9',
      draftId: 'draft-1',
      numImages: 2,
      prompt: 'Boost contrast and clean the logo lockup.',
      requestedById: 'agent-1',
      requestedByType: 'agent',
      sourceVersionNumber: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://queue.fal.run/fal-ai/nano-banana-2/edit',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'job-1',
        numImages: 2,
        provider: 'fal-nano-banana-2-edit',
        sourceVersionNumber: 2,
        status: 'queued',
      }),
    );
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        lane: 'image_edit',
        operation: 'image_edit_submit',
        provider: 'fal-nano-banana-2-edit',
        status: 'ok',
      }),
    );
  });

  test('reconciles completed fal jobs into stored candidates', async () => {
    process.env.FAL_API_KEY = 'fal-test-key';
    let candidatesInserted = false;
    let jobCompleted = false;
    const recordExecution = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes("status IN ('queued', 'processing')")) {
        return Promise.resolve({
          rows: [
            {
              aspect_ratio: null,
              completed_at: null,
              created_at: new Date('2026-03-07T12:00:00.000Z'),
              draft_id: 'draft-1',
              failure_code: null,
              failure_message: null,
              id: 'job-1',
              last_synced_at: null,
              metadata: { route: createRoute() },
              model: 'fal-ai/nano-banana-2/edit',
              num_images: 1,
              prompt: 'Add a sharper headline treatment.',
              provider: 'fal-nano-banana-2-edit',
              provider_cancel_url: null,
              provider_request_id: 'req-1',
              provider_response_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1',
              provider_status: 'IN_QUEUE',
              provider_status_url:
                'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1/status',
              reference_image_urls: ['https://example.com/source.png'],
              requested_by_id: 'agent-1',
              requested_by_type: 'agent',
              source_version_id: 'version-2',
              source_version_number: 2,
              status: 'queued',
              updated_at: new Date('2026-03-07T12:00:00.000Z'),
            },
          ],
        });
      }
      if (sql.includes('INSERT INTO image_edit_candidates')) {
        candidatesInserted = true;
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('UPDATE image_edit_jobs') && sql.includes("status = 'completed'")) {
        jobCompleted = true;
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('SELECT *') && sql.includes('FROM image_edit_jobs')) {
        return Promise.resolve({
          rows: [
            {
              aspect_ratio: null,
              completed_at: jobCompleted ? new Date('2026-03-07T12:05:00.000Z') : null,
              created_at: new Date('2026-03-07T12:00:00.000Z'),
              draft_id: 'draft-1',
              failure_code: null,
              failure_message: null,
              id: 'job-1',
              last_synced_at: new Date('2026-03-07T12:05:00.000Z'),
              metadata: { route: createRoute() },
              model: 'fal-ai/nano-banana-2/edit',
              num_images: 1,
              prompt: 'Add a sharper headline treatment.',
              provider: 'fal-nano-banana-2-edit',
              provider_cancel_url: null,
              provider_request_id: 'req-1',
              provider_response_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1',
              provider_status: 'COMPLETED',
              provider_status_url:
                'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1/status',
              reference_image_urls: ['https://example.com/source.png'],
              requested_by_id: 'agent-1',
              requested_by_type: 'agent',
              source_version_id: 'version-2',
              source_version_number: 2,
              status: jobCompleted ? 'completed' : 'queued',
              updated_at: new Date('2026-03-07T12:05:00.000Z'),
            },
          ],
        });
      }
      if (sql.includes('SELECT *') && sql.includes('FROM image_edit_candidates')) {
        return Promise.resolve({
          rows: candidatesInserted
            ? [
                {
                  created_at: new Date('2026-03-07T12:05:00.000Z'),
                  draft_id: 'draft-1',
                  id: 'candidate-1',
                  image_storage_key: 'image-edit/drafts/draft-1/jobs/job-1/candidate-1.png',
                  image_url: 'https://storage.example.com/image.png',
                  job_id: 'job-1',
                  metadata: { sourceStoredLocally: true },
                  model: 'fal-ai/nano-banana-2/edit',
                  position: 1,
                  promoted_at: null,
                  promoted_pull_request_id: null,
                  provider: 'fal-nano-banana-2-edit',
                  source_artifact_url: 'https://fal.media/image.png',
                  thumbnail_storage_key:
                    'image-edit/drafts/draft-1/jobs/job-1/candidate-1-thumb.png',
                  thumbnail_url: 'https://storage.example.com/thumb.png',
                },
              ]
            : [],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          logs: [],
          response_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1',
          status: 'COMPLETED',
        }),
        ok: true,
        status: 200,
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          response: {
            description: 'Updated draft treatment',
            images: [
              {
                content_type: 'image/png',
                file_name: 'candidate.png',
                url: 'https://fal.media/image.png',
              },
            ],
          },
          status: 'COMPLETED',
        }),
        ok: true,
        status: 200,
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
        headers: new Headers({ 'content-type': 'image/png' }),
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);
    const storageService = {
      deleteObject: jest.fn(),
      generateSignedUrl: jest.fn(),
      uploadObject: jest
        .fn()
        .mockResolvedValueOnce({
          key: 'image-edit/drafts/draft-1/jobs/job-1/candidate-1.png',
          url: 'https://storage.example.com/image.png',
        })
        .mockResolvedValueOnce({
          key: 'image-edit/drafts/draft-1/jobs/job-1/candidate-1-thumb.png',
          url: 'https://storage.example.com/thumb.png',
        }),
      uploadVersion: jest.fn(),
    } as unknown as StorageService;
    const service = new ImageEditServiceImpl({
      fetchImpl: fetchMock as unknown as typeof fetch,
      pool: createPool(query),
      providerRouting: {
        recordExecution,
        resolveRoute: jest.fn().mockReturnValue(createRoute()),
      } as unknown as ProviderRoutingService,
      storageService,
    });

    const jobs = await service.listJobsByDraft('draft-1', { refreshActive: true });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        id: 'job-1',
        status: 'completed',
      }),
    );
    expect(jobs[0].candidates).toEqual([
      expect.objectContaining({
        id: 'candidate-1',
        imageUrl: 'https://storage.example.com/image.png',
      }),
    ]);
    expect(recordExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'image_edit_reconcile',
        provider: 'fal-nano-banana-2-edit',
        status: 'ok',
      }),
    );
  });

  test('promotes stored image edit candidates into pull requests', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM image_edit_candidates c')) {
        return Promise.resolve({
          rows: [
            {
              created_at: new Date('2026-03-07T12:00:00.000Z'),
              draft_id: 'draft-1',
              id: 'candidate-1',
              image_storage_key: null,
              image_url: 'https://example.com/candidate.png',
              job_id: 'job-1',
              metadata: {},
              model: 'fal-ai/nano-banana-2/edit',
              position: 1,
              promoted_at: null,
              promoted_pull_request_id: null,
              prompt: 'Clean the typography stack.',
              provider: 'fal-nano-banana-2-edit',
              source_artifact_url: 'https://fal.media/candidate.png',
              source_version_number: 2,
              thumbnail_storage_key: null,
              thumbnail_url: 'https://example.com/candidate-thumb.png',
            },
          ],
        });
      }
      if (sql.includes('UPDATE image_edit_candidates')) {
        return Promise.resolve({
          rows: [
            {
              created_at: new Date('2026-03-07T12:00:00.000Z'),
              draft_id: 'draft-1',
              id: 'candidate-1',
              image_storage_key: null,
              image_url: 'https://example.com/candidate.png',
              job_id: 'job-1',
              metadata: {},
              model: 'fal-ai/nano-banana-2/edit',
              position: 1,
              promoted_at: new Date('2026-03-07T12:10:00.000Z'),
              promoted_pull_request_id: 'pr-1',
              provider: 'fal-nano-banana-2-edit',
              source_artifact_url: 'https://fal.media/candidate.png',
              thumbnail_storage_key: null,
              thumbnail_url: 'https://example.com/candidate-thumb.png',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const submitPullRequest = jest.fn().mockResolvedValue({
      createdAt: new Date('2026-03-07T12:10:00.000Z'),
      description: 'Candidate is ready for review.',
      draftId: 'draft-1',
      id: 'pr-1',
      makerId: 'agent-1',
      proposedVersion: 3,
      severity: 'minor',
      status: 'pending',
    });
    const service = new ImageEditServiceImpl({
      pool: createPool(query),
      pullRequestService: {
        createForkFromRejected: jest.fn(),
        decidePullRequest: jest.fn(),
        getDraftStatus: jest.fn(),
        getReviewData: jest.fn(),
        listByDraft: jest.fn(),
        submitPullRequest,
      } as unknown as PullRequestService,
      storageService: {
        deleteObject: jest.fn(),
        generateSignedUrl: jest.fn(),
        uploadObject: jest.fn(),
        uploadVersion: jest.fn(),
      } as unknown as StorageService,
    });

    const result = await service.promoteCandidateToPullRequest({
      candidateId: 'candidate-1',
      description: 'Candidate is ready for review.',
      draftId: 'draft-1',
      makerId: 'agent-1',
      severity: 'minor',
    });

    expect(submitPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        imageUrl: 'https://example.com/candidate.png',
        thumbnailUrl: 'https://example.com/candidate-thumb.png',
      }),
      expect.any(Object),
    );
    expect(result.pullRequest.id).toBe('pr-1');
    expect(result.candidate.promotedPullRequestId).toBe('pr-1');
  });
});
