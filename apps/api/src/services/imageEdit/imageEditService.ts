import { Pool, type PoolClient } from 'pg';
import sharp from 'sharp';
import { env } from '../../config/env';
import { db } from '../../db/pool';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import { providerRoutingService } from '../providerRouting/providerRoutingService';
import type { ProviderLaneResolvedRoute, ProviderRoutingService } from '../providerRouting/types';
import { PullRequestServiceImpl } from '../pullRequest/pullRequestService';
import type { PullRequestService } from '../pullRequest/types';
import { StorageServiceImpl } from '../storage/storageService';
import type { StorageService } from '../storage/types';
import type {
  CreateImageEditJobInput,
  ImageEditAspectRatio,
  ImageEditCandidate,
  ImageEditJob,
  ImageEditJobStatus,
  ImageEditService,
  ListImageEditJobsOptions,
  PromoteImageEditCandidateInput,
  PromoteImageEditCandidateResult,
} from './types';

interface ImageEditJobRow {
  aspect_ratio: string | null;
  completed_at: Date | null;
  created_at: Date;
  draft_id: string;
  failure_code: string | null;
  failure_message: string | null;
  id: string;
  last_synced_at: Date | null;
  metadata: Record<string, unknown> | null;
  model: string;
  num_images: number | string;
  prompt: string;
  provider: string;
  provider_cancel_url: string | null;
  provider_request_id: string;
  provider_response_url: string;
  provider_status: string | null;
  provider_status_url: string;
  reference_image_urls: unknown;
  requested_by_id: string | null;
  requested_by_type: 'admin' | 'agent' | 'observer' | 'system';
  source_version_id: string;
  source_version_number: number | string;
  status: ImageEditJobStatus;
  updated_at: Date;
}

interface ImageEditCandidateRow {
  created_at: Date;
  draft_id: string;
  id: string;
  image_storage_key: string | null;
  image_url: string;
  job_id: string;
  metadata: Record<string, unknown> | null;
  model: string;
  position: number | string;
  promoted_at: Date | null;
  promoted_pull_request_id: string | null;
  provider: string;
  source_artifact_url: string;
  thumbnail_storage_key: string | null;
  thumbnail_url: string;
}

interface ImageEditDraftVersionRow {
  current_version: number | string;
  draft_id: string;
  image_url: string;
  source_version_id: string;
  source_version_number: number | string;
  status: 'draft' | 'release';
}

interface ImageEditCandidateJoinRow extends ImageEditCandidateRow {
  prompt: string;
  source_version_number: number | string;
}

interface FalSubmitResponse {
  cancelUrl: string | null;
  providerStatus: string | null;
  requestId: string;
  responseUrl: string;
  statusUrl: string;
}

interface FalStatusPayload {
  logs: Array<Record<string, unknown>>;
  responseUrl: string | null;
  status: string;
}

interface PersistedCandidateAsset {
  imageStorageKey: string | null;
  imageUrl: string;
  metadata: Record<string, unknown>;
  model: string;
  position: number;
  provider: string;
  sourceArtifactUrl: string;
  thumbnailStorageKey: string | null;
  thumbnailUrl: string;
}

interface ImageEditServiceOptions {
  fetchImpl?: typeof fetch;
  pool?: Pool;
  providerRouting?: ProviderRoutingService;
  pullRequestService?: PullRequestService;
  storageService?: StorageService;
}

const FAL_IMAGE_EDIT_PROVIDER = 'fal-nano-banana-2-edit';
const DEFAULT_FAL_BASE_URL = 'https://queue.fal.run';
const DEFAULT_FAL_MODEL_PATH = 'fal-ai/nano-banana-2/edit';
const DEFAULT_FAL_TIMEOUT_MS = 15_000;
const MAX_FAL_IMAGE_COUNT = 4;
const MIN_FAL_IMAGE_COUNT = 1;
const THUMBNAIL_WIDTH = 480;
const ACTIVE_JOB_SYNC_MIN_INTERVAL_MS = 2000;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const URL_EXTENSION_PATTERN = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  isRecord(value) ? value : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const toNullableDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  return null;
};

const toJsonString = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const normalizeHttpUrl = (value: unknown): string | null => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    return HTTP_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const normalizeUniqueImageUrls = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const url = normalizeHttpUrl(value);
    if (!(url && !seen.has(url))) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
};

const mapCandidate = (row: ImageEditCandidateRow): ImageEditCandidate => ({
  createdAt: row.created_at,
  draftId: row.draft_id,
  id: row.id,
  imageStorageKey: row.image_storage_key,
  imageUrl: row.image_url,
  jobId: row.job_id,
  metadata: isRecord(row.metadata) ? row.metadata : {},
  model: row.model,
  position: Number(row.position),
  promotedAt: row.promoted_at,
  promotedPullRequestId: row.promoted_pull_request_id,
  provider: row.provider,
  sourceArtifactUrl: row.source_artifact_url,
  thumbnailStorageKey: row.thumbnail_storage_key,
  thumbnailUrl: row.thumbnail_url,
});

const mapJob = (row: ImageEditJobRow, candidates: ImageEditCandidate[]): ImageEditJob => {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const route = asRecord(metadata.route) as ProviderLaneResolvedRoute | null;

  return {
    aspectRatio: (row.aspect_ratio as ImageEditAspectRatio | null) ?? null,
    candidates,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    draftId: row.draft_id,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    id: row.id,
    lastSyncedAt: row.last_synced_at,
    metadata,
    model: row.model,
    numImages: Number(row.num_images),
    prompt: row.prompt,
    provider: row.provider,
    providerRequestId: row.provider_request_id,
    providerStatus: row.provider_status,
    referenceImageUrls: normalizeUniqueImageUrls(asArray(row.reference_image_urls)),
    requestedById: row.requested_by_id,
    requestedByType: row.requested_by_type,
    route,
    sourceVersionId: row.source_version_id,
    sourceVersionNumber: Number(row.source_version_number),
    status: row.status,
    updatedAt: row.updated_at,
  };
};

const buildCandidateStorageKey = ({
  draftId,
  extension,
  jobId,
  kind,
  position,
}: {
  draftId: string;
  extension: string;
  jobId: string;
  kind: 'image' | 'thumbnail';
  position: number;
}) =>
  kind === 'thumbnail'
    ? `image-edit/drafts/${draftId}/jobs/${jobId}/candidate-${position}-thumb.${extension}`
    : `image-edit/drafts/${draftId}/jobs/${jobId}/candidate-${position}.${extension}`;

const getExtensionFromContentType = (contentType: string | null): string => {
  const normalized = (contentType ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
};

const getExtensionFromUrl = (url: string): string | null => {
  const match = url.match(URL_EXTENSION_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
};

const getNormalizedExtension = (contentType: string | null, url: string): string => {
  const fromContentType = getExtensionFromContentType(contentType);
  const fromUrl = getExtensionFromUrl(url);
  if (fromContentType === 'png' && fromUrl && ['jpg', 'jpeg', 'png', 'webp'].includes(fromUrl)) {
    return fromUrl === 'jpeg' ? 'jpg' : fromUrl;
  }
  return fromContentType;
};

const normalizeSubmittedStatus = (status: string | null): ImageEditJobStatus =>
  status === 'IN_PROGRESS' ? 'processing' : 'queued';

const normalizeSyncStatus = (status: string): ImageEditJobStatus => {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'IN_PROGRESS') {
    return 'processing';
  }
  if (normalized === 'COMPLETED') {
    return 'completed';
  }
  if (normalized === 'FAILED' || normalized === 'ERROR' || normalized === 'CANCELLED') {
    return 'failed';
  }
  return 'queued';
};

const parseFalModelPath = (value: string): { modelPath: string; routeModel: string } => {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 3) {
    throw new ServiceError(
      'IMAGE_EDIT_NOT_CONFIGURED',
      'FAL image edit model path must include a subpath, e.g. fal-ai/nano-banana-2/edit.',
      503,
    );
  }
  return {
    modelPath: normalized,
    routeModel: normalized,
  };
};

const buildFalSubmitPayload = ({
  aspectRatio,
  numImages,
  prompt,
  referenceImageUrls,
}: {
  aspectRatio?: ImageEditAspectRatio;
  numImages: number;
  prompt: string;
  referenceImageUrls: string[];
}) => ({
  aspect_ratio: aspectRatio,
  image_urls: referenceImageUrls,
  limit_generations: true,
  num_images: numImages,
  prompt,
  sync_mode: false,
});

const parseFalSubmitResponse = (payload: unknown): FalSubmitResponse => {
  const body = asRecord(payload);
  const requestId = asString(body?.request_id ?? body?.requestId);
  const responseUrl = normalizeHttpUrl(body?.response_url ?? body?.responseUrl);
  const statusUrl = normalizeHttpUrl(body?.status_url ?? body?.statusUrl);
  const cancelUrl = normalizeHttpUrl(body?.cancel_url ?? body?.cancelUrl);
  const providerStatus = asString(body?.status)?.toUpperCase() ?? 'IN_QUEUE';
  if (!(requestId && responseUrl && statusUrl)) {
    throw new ServiceError(
      'IMAGE_EDIT_INVALID_RESPONSE',
      'fal image edit queue submission returned an invalid response payload.',
      502,
    );
  }
  return {
    cancelUrl,
    providerStatus,
    requestId,
    responseUrl,
    statusUrl,
  };
};

const parseFalStatusPayload = (payload: unknown): FalStatusPayload => {
  const body = asRecord(payload);
  const status = asString(body?.status)?.toUpperCase();
  if (!status) {
    throw new ServiceError(
      'IMAGE_EDIT_INVALID_RESPONSE',
      'fal image edit status payload did not include a status.',
      502,
    );
  }
  const responseUrl =
    normalizeHttpUrl(body?.response_url ?? body?.responseUrl) ??
    normalizeHttpUrl(asRecord(body?.response)?.url);
  return {
    logs: asArray(body?.logs).filter(isRecord),
    responseUrl,
    status,
  };
};

const extractFalErrorMessage = (payload: unknown): string | null => {
  const body = asRecord(payload);
  const error = asRecord(body?.error);
  return (
    asString(error?.message) ??
    asString(body?.message) ??
    asString(body?.detail) ??
    asString(body?.error)
  );
};

const parseFalResultImages = (payload: unknown): Array<Record<string, unknown>> => {
  const body = asRecord(payload);
  const response = asRecord(body?.response);
  if (response) {
    return asArray(response.images).filter(isRecord);
  }
  return asArray(body?.images).filter(isRecord);
};

const parseFalResultDescription = (payload: unknown): string | null => {
  const body = asRecord(payload);
  return asString(asRecord(body?.response)?.description) ?? asString(body?.description);
};

const shouldSyncJob = (row: ImageEditJobRow): boolean => {
  if (!['queued', 'processing'].includes(row.status)) {
    return false;
  }
  const lastSyncedAt = toNullableDate(row.last_synced_at);
  if (!lastSyncedAt) {
    return true;
  }
  return Date.now() - lastSyncedAt.valueOf() >= ACTIVE_JOB_SYNC_MIN_INTERVAL_MS;
};

const falAuthHeaders = (apiKey: string) => ({
  Authorization: `Key ${apiKey}`,
  'Content-Type': 'application/json',
});

export class ImageEditServiceImpl implements ImageEditService {
  private readonly falBaseUrl: string;
  private readonly falModelPath: string;
  private readonly falTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly pool: Pool;
  private readonly providerRouting: ProviderRoutingService;
  private readonly pullRequestService: PullRequestService;
  private readonly storageService: StorageService;

  constructor(options: ImageEditServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.falBaseUrl = (
      process.env.FAL_IMAGE_EDIT_BASE_URL ??
      env.FAL_IMAGE_EDIT_BASE_URL ??
      DEFAULT_FAL_BASE_URL
    ).replace(/\/$/, '');
    this.falModelPath = parseFalModelPath(
      process.env.FAL_IMAGE_EDIT_MODEL ?? env.FAL_IMAGE_EDIT_MODEL ?? DEFAULT_FAL_MODEL_PATH,
    ).modelPath;
    this.falTimeoutMs = Number(
      process.env.FAL_IMAGE_EDIT_TIMEOUT_MS ??
        env.FAL_IMAGE_EDIT_TIMEOUT_MS ??
        DEFAULT_FAL_TIMEOUT_MS,
    );
    this.pool = options.pool ?? db;
    this.providerRouting = options.providerRouting ?? providerRoutingService;
    this.pullRequestService = options.pullRequestService ?? new PullRequestServiceImpl(this.pool);
    this.storageService = options.storageService ?? new StorageServiceImpl();
  }

  async createJob(input: CreateImageEditJobInput): Promise<ImageEditJob> {
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new ServiceError('IMAGE_EDIT_INVALID_INPUT', 'prompt is required.', 400);
    }

    const numImages = this.normalizeNumImages(input.numImages);
    const route = this.providerRouting.resolveRoute({
      lane: 'image_edit',
      preferredProviders: input.preferredProviders,
    });
    const selectedProvider = route.resolvedProviders[0]?.provider ?? null;
    const routeModel = route.resolvedProviders[0]?.model ?? this.falModelPath;
    const startedAt = Date.now();

    try {
      if (!selectedProvider) {
        throw new ServiceError(
          'IMAGE_EDIT_PROVIDER_UNAVAILABLE',
          'No enabled image edit provider is configured for this lane.',
          503,
        );
      }
      if (selectedProvider !== FAL_IMAGE_EDIT_PROVIDER) {
        throw new ServiceError(
          'IMAGE_EDIT_PROVIDER_UNSUPPORTED',
          `image_edit provider ${selectedProvider} is not implemented yet.`,
          503,
        );
      }

      const apiKey = this.getFalApiKey();
      const sourceVersion = await this.getSourceVersion({
        draftId: input.draftId,
        sourceVersionNumber: input.sourceVersionNumber,
      });
      const referenceImageUrls = normalizeUniqueImageUrls([
        sourceVersion.image_url,
        ...(input.referenceImageUrls ?? []),
      ]).slice(0, MAX_FAL_IMAGE_COUNT);
      if (referenceImageUrls.length === 0) {
        throw new ServiceError(
          'IMAGE_EDIT_INVALID_INPUT',
          'At least one source image URL is required for image edit.',
          400,
        );
      }

      const queued = parseFalSubmitResponse(
        await this.fetchJson({
          body: buildFalSubmitPayload({
            aspectRatio: input.aspectRatio,
            numImages,
            prompt,
            referenceImageUrls,
          }),
          headers: falAuthHeaders(apiKey),
          timeoutMs: this.falTimeoutMs,
          url: `${this.falBaseUrl}/${this.falModelPath}`,
        }),
      );

      const inserted = await this.pool.query<ImageEditJobRow>(
        `INSERT INTO image_edit_jobs (
           draft_id,
           source_version_id,
           source_version_number,
           prompt,
           num_images,
           aspect_ratio,
           reference_image_urls,
           provider,
           model,
           provider_request_id,
           provider_status,
           provider_status_url,
           provider_response_url,
           provider_cancel_url,
           status,
           requested_by_type,
           requested_by_id,
           metadata,
           last_synced_at
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7::jsonb,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15,
           $16,
           $17,
           $18::jsonb,
           NOW()
         )
         RETURNING *`,
        [
          input.draftId,
          sourceVersion.source_version_id,
          Number(sourceVersion.source_version_number),
          prompt,
          numImages,
          input.aspectRatio ?? null,
          toJsonString(referenceImageUrls),
          selectedProvider,
          routeModel,
          queued.requestId,
          queued.providerStatus,
          queued.statusUrl,
          queued.responseUrl,
          queued.cancelUrl,
          normalizeSubmittedStatus(queued.providerStatus),
          input.requestedByType ?? 'agent',
          input.requestedById ?? null,
          toJsonString({
            providerSubmitStatus: queued.providerStatus,
            route,
            sourceImageUrl: sourceVersion.image_url,
          }),
        ],
      );

      await this.providerRouting.recordExecution({
        draftId: input.draftId,
        durationMs: Date.now() - startedAt,
        lane: 'image_edit',
        metadata: {
          imageCount: numImages,
          jobId: inserted.rows[0].id,
          providerRequestId: queued.requestId,
          sourceVersionNumber: Number(sourceVersion.source_version_number),
        },
        model: routeModel,
        operation: 'image_edit_submit',
        provider: selectedProvider,
        route,
        status: 'ok',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'agent',
      });

      return mapJob(inserted.rows[0], []);
    } catch (error) {
      const serviceError =
        error instanceof ServiceError
          ? error
          : new ServiceError(
              'IMAGE_EDIT_SUBMIT_FAILED',
              error instanceof Error ? error.message : 'Image edit submit failed.',
              502,
            );
      await this.providerRouting.recordExecution({
        draftId: input.draftId,
        durationMs: Date.now() - startedAt,
        lane: 'image_edit',
        metadata: {
          errorCode: serviceError.code,
          errorMessage: serviceError.message,
          imageCount: numImages,
        },
        model: routeModel,
        operation: 'image_edit_submit',
        provider: selectedProvider,
        route,
        status: 'failed',
        userId: input.requestedById ?? null,
        userType: input.requestedByType ?? 'agent',
      });
      throw serviceError;
    }
  }

  async listJobsByDraft(
    draftId: string,
    options: ListImageEditJobsOptions = {},
  ): Promise<ImageEditJob[]> {
    if (options.refreshActive) {
      const activeJobs = await this.pool.query<ImageEditJobRow>(
        `SELECT *
         FROM image_edit_jobs
         WHERE draft_id = $1
           AND status IN ('queued', 'processing')
         ORDER BY created_at DESC`,
        [draftId],
      );
      for (const row of activeJobs.rows) {
        if (!shouldSyncJob(row)) {
          continue;
        }
        await this.syncJob(row);
      }
    }

    const [jobsResult, candidatesResult] = await Promise.all([
      this.pool.query<ImageEditJobRow>(
        `SELECT *
         FROM image_edit_jobs
         WHERE draft_id = $1
         ORDER BY created_at DESC`,
        [draftId],
      ),
      this.pool.query<ImageEditCandidateRow>(
        `SELECT *
         FROM image_edit_candidates
         WHERE draft_id = $1
         ORDER BY created_at DESC, position ASC`,
        [draftId],
      ),
    ]);

    const candidatesByJobId = new Map<string, ImageEditCandidate[]>();
    for (const row of candidatesResult.rows) {
      const candidate = mapCandidate(row);
      const existing = candidatesByJobId.get(candidate.jobId) ?? [];
      existing.push(candidate);
      candidatesByJobId.set(candidate.jobId, existing);
    }

    return jobsResult.rows.map((row) => mapJob(row, candidatesByJobId.get(row.id) ?? []));
  }

  async promoteCandidateToPullRequest(
    input: PromoteImageEditCandidateInput,
    client?: DbClient,
  ): Promise<PromoteImageEditCandidateResult> {
    return this.withTransaction(client, async (transaction) => {
      const candidateResult = await transaction.query(
        `SELECT
           c.*,
           j.prompt,
           j.source_version_number
         FROM image_edit_candidates c
         JOIN image_edit_jobs j ON j.id = c.job_id
         WHERE c.id = $1
           AND c.draft_id = $2`,
        [input.candidateId, input.draftId],
      );
      const candidateRow = candidateResult.rows[0] as ImageEditCandidateJoinRow | undefined;
      if (!candidateRow) {
        throw new ServiceError(
          'IMAGE_EDIT_CANDIDATE_NOT_FOUND',
          'Image edit candidate not found.',
          404,
        );
      }
      if (candidateRow.promoted_pull_request_id) {
        throw new ServiceError(
          'IMAGE_EDIT_CANDIDATE_ALREADY_PROMOTED',
          'Image edit candidate is already promoted to a pull request.',
          409,
        );
      }

      const pullRequest = await this.pullRequestService.submitPullRequest(
        {
          addressedFixRequests: input.addressedFixRequests,
          description: input.description,
          draftId: input.draftId,
          imageUrl: candidateRow.image_url,
          makerId: input.makerId,
          severity: input.severity,
          thumbnailUrl: candidateRow.thumbnail_url,
        },
        transaction,
      );

      const updatedCandidate = await transaction.query(
        `UPDATE image_edit_candidates
         SET promoted_pull_request_id = $1,
             promoted_at = NOW(),
             metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{promotion}',
               $2::jsonb,
               true
             )
         WHERE id = $3
         RETURNING *`,
        [
          pullRequest.id,
          toJsonString({
            promotedAt: new Date().toISOString(),
            promotedById: input.makerId,
            severity: input.severity,
          }),
          input.candidateId,
        ],
      );

      return {
        candidate: mapCandidate(updatedCandidate.rows[0] as ImageEditCandidateRow),
        pullRequest,
      };
    });
  }

  private async syncJob(jobRow: ImageEditJobRow): Promise<void> {
    const apiKey = this.getFalApiKey();
    const startedAt = Date.now();
    const route =
      (asRecord(jobRow.metadata)?.route as ProviderLaneResolvedRoute | null) ??
      this.providerRouting.resolveRoute({ lane: 'image_edit' });

    try {
      const statusPayload = parseFalStatusPayload(
        await this.fetchJson({
          headers: falAuthHeaders(apiKey),
          timeoutMs: this.falTimeoutMs,
          url: this.appendLogsQuery(jobRow.provider_status_url),
        }),
      );
      const normalizedStatus = normalizeSyncStatus(statusPayload.status);
      if (normalizedStatus === 'queued' || normalizedStatus === 'processing') {
        await this.pool.query(
          `UPDATE image_edit_jobs
           SET status = $1,
               provider_status = $2,
               failure_code = NULL,
               failure_message = NULL,
               metadata = $3::jsonb,
               last_synced_at = NOW(),
               updated_at = NOW()
           WHERE id = $4`,
          [
            normalizedStatus,
            statusPayload.status,
            toJsonString({
              ...(isRecord(jobRow.metadata) ? jobRow.metadata : {}),
              lastProviderLogs: statusPayload.logs,
            }),
            jobRow.id,
          ],
        );
        return;
      }

      if (normalizedStatus === 'failed') {
        const failureMessage =
          extractFalErrorMessage(statusPayload) ?? 'fal image edit job failed.';
        await this.pool.query(
          `UPDATE image_edit_jobs
           SET status = 'failed',
               provider_status = $1,
               failure_code = 'IMAGE_EDIT_PROVIDER_FAILED',
               failure_message = $2,
               metadata = $3::jsonb,
               last_synced_at = NOW(),
               updated_at = NOW(),
               completed_at = NOW()
           WHERE id = $4`,
          [
            statusPayload.status,
            failureMessage,
            toJsonString({
              ...(isRecord(jobRow.metadata) ? jobRow.metadata : {}),
              lastProviderLogs: statusPayload.logs,
            }),
            jobRow.id,
          ],
        );
        await this.providerRouting.recordExecution({
          draftId: jobRow.draft_id,
          durationMs: Date.now() - startedAt,
          lane: 'image_edit',
          metadata: {
            errorCode: 'IMAGE_EDIT_PROVIDER_FAILED',
            errorMessage: failureMessage,
            jobId: jobRow.id,
          },
          model: jobRow.model,
          operation: 'image_edit_reconcile',
          provider: jobRow.provider,
          route,
          status: 'failed',
          userId: jobRow.requested_by_id,
          userType: jobRow.requested_by_type,
        });
        return;
      }

      const resultPayload = await this.fetchJson({
        headers: falAuthHeaders(apiKey),
        timeoutMs: this.falTimeoutMs,
        url: statusPayload.responseUrl ?? jobRow.provider_response_url,
      });
      const providerStatus =
        asString(asRecord(resultPayload)?.status)?.toUpperCase() ?? statusPayload.status;
      if (providerStatus !== 'COMPLETED') {
        await this.pool.query(
          `UPDATE image_edit_jobs
           SET status = 'processing',
               provider_status = $1,
               metadata = $2::jsonb,
               last_synced_at = NOW(),
               updated_at = NOW()
           WHERE id = $3`,
          [
            providerStatus,
            toJsonString({
              ...(isRecord(jobRow.metadata) ? jobRow.metadata : {}),
              lastProviderLogs: statusPayload.logs,
            }),
            jobRow.id,
          ],
        );
        return;
      }

      const images = parseFalResultImages(resultPayload);
      if (images.length === 0) {
        throw new ServiceError(
          'IMAGE_EDIT_INVALID_RESPONSE',
          'fal image edit completed without candidate images.',
          502,
        );
      }

      const description = parseFalResultDescription(resultPayload);
      const persistedCandidates = await Promise.all(
        images.map((image, index) =>
          this.persistCandidateAsset({
            description,
            draftId: jobRow.draft_id,
            image,
            jobId: jobRow.id,
            model: jobRow.model,
            provider: jobRow.provider,
            position: index + 1,
          }),
        ),
      );

      await this.withTransaction(undefined, async (transaction) => {
        for (const candidate of persistedCandidates) {
          await transaction.query(
            `INSERT INTO image_edit_candidates (
               job_id,
               draft_id,
               position,
               provider,
               model,
               source_artifact_url,
               image_storage_key,
               image_url,
               thumbnail_storage_key,
               thumbnail_url,
               metadata
             )
             VALUES (
               $1,
               $2,
               $3,
               $4,
               $5,
               $6,
               $7,
               $8,
               $9,
               $10,
               $11::jsonb
             )
             ON CONFLICT (job_id, position)
             DO UPDATE SET
               provider = EXCLUDED.provider,
               model = EXCLUDED.model,
               source_artifact_url = EXCLUDED.source_artifact_url,
               image_storage_key = EXCLUDED.image_storage_key,
               image_url = EXCLUDED.image_url,
               thumbnail_storage_key = EXCLUDED.thumbnail_storage_key,
               thumbnail_url = EXCLUDED.thumbnail_url,
               metadata = EXCLUDED.metadata`,
            [
              jobRow.id,
              jobRow.draft_id,
              candidate.position,
              candidate.provider,
              candidate.model,
              candidate.sourceArtifactUrl,
              candidate.imageStorageKey,
              candidate.imageUrl,
              candidate.thumbnailStorageKey,
              candidate.thumbnailUrl,
              toJsonString(candidate.metadata),
            ],
          );
        }

        await transaction.query(
          `UPDATE image_edit_jobs
           SET status = 'completed',
               provider_status = 'COMPLETED',
               failure_code = NULL,
               failure_message = NULL,
               metadata = $1::jsonb,
               last_synced_at = NOW(),
               updated_at = NOW(),
               completed_at = NOW()
           WHERE id = $2`,
          [
            toJsonString({
              ...(isRecord(jobRow.metadata) ? jobRow.metadata : {}),
              candidateCount: persistedCandidates.length,
              lastProviderLogs: statusPayload.logs,
              providerDescription: description,
            }),
            jobRow.id,
          ],
        );
      });

      await this.providerRouting.recordExecution({
        draftId: jobRow.draft_id,
        durationMs: Date.now() - startedAt,
        lane: 'image_edit',
        metadata: {
          candidateCount: persistedCandidates.length,
          jobId: jobRow.id,
          providerDescription: description,
        },
        model: jobRow.model,
        operation: 'image_edit_reconcile',
        provider: jobRow.provider,
        route,
        status: 'ok',
        userId: jobRow.requested_by_id,
        userType: jobRow.requested_by_type,
      });
    } catch (error) {
      const serviceError =
        error instanceof ServiceError
          ? error
          : new ServiceError(
              'IMAGE_EDIT_RECONCILE_FAILED',
              error instanceof Error ? error.message : 'Image edit reconcile failed.',
              502,
            );
      await this.pool.query(
        `UPDATE image_edit_jobs
         SET status = 'failed',
             provider_status = COALESCE(provider_status, 'ERROR'),
             failure_code = $1,
             failure_message = $2,
             last_synced_at = NOW(),
             updated_at = NOW(),
             completed_at = NOW()
         WHERE id = $3`,
        [serviceError.code, serviceError.message, jobRow.id],
      );
      await this.providerRouting.recordExecution({
        draftId: jobRow.draft_id,
        durationMs: Date.now() - startedAt,
        lane: 'image_edit',
        metadata: {
          errorCode: serviceError.code,
          errorMessage: serviceError.message,
          jobId: jobRow.id,
        },
        model: jobRow.model,
        operation: 'image_edit_reconcile',
        provider: jobRow.provider,
        route,
        status: 'failed',
        userId: jobRow.requested_by_id,
        userType: jobRow.requested_by_type,
      });
    }
  }

  private async persistCandidateAsset({
    description,
    draftId,
    image,
    jobId,
    model,
    provider,
    position,
  }: {
    description: string | null;
    draftId: string;
    image: Record<string, unknown>;
    jobId: string;
    model: string;
    provider: string;
    position: number;
  }): Promise<PersistedCandidateAsset> {
    const sourceArtifactUrl = normalizeHttpUrl(image.url);
    if (!sourceArtifactUrl) {
      throw new ServiceError(
        'IMAGE_EDIT_INVALID_RESPONSE',
        'fal image edit result did not include a valid image URL.',
        502,
      );
    }

    const fileName = asString(image.file_name ?? image.fileName);
    const providerContentType = asString(image.content_type ?? image.contentType);
    try {
      const response = await this.fetchImpl(sourceArtifactUrl);
      if (!response.ok) {
        throw new Error(`Asset download failed with status ${response.status}.`);
      }
      const contentType = response.headers.get('content-type')?.trim() ?? providerContentType;
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const extension = getNormalizedExtension(contentType, sourceArtifactUrl);
      const imageStorageKey = buildCandidateStorageKey({
        draftId,
        extension,
        jobId,
        kind: 'image',
        position,
      });
      const thumbnailStorageKey = buildCandidateStorageKey({
        draftId,
        extension: 'png',
        jobId,
        kind: 'thumbnail',
        position,
      });
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize({ width: THUMBNAIL_WIDTH })
        .png()
        .toBuffer();

      const [uploadedImage, uploadedThumbnail] = await Promise.all([
        this.storageService.uploadObject({
          body: imageBuffer,
          contentType: contentType ?? 'image/png',
          key: imageStorageKey,
        }),
        this.storageService.uploadObject({
          body: thumbnailBuffer,
          contentType: 'image/png',
          key: thumbnailStorageKey,
        }),
      ]);

      return {
        imageStorageKey: uploadedImage.key,
        imageUrl: uploadedImage.url,
        metadata: {
          contentType: contentType ?? null,
          description,
          fileName,
          sourceStoredLocally: true,
        },
        model,
        position,
        provider,
        sourceArtifactUrl,
        thumbnailStorageKey: uploadedThumbnail.key,
        thumbnailUrl: uploadedThumbnail.url,
      };
    } catch (error) {
      return {
        imageStorageKey: null,
        imageUrl: sourceArtifactUrl,
        metadata: {
          contentType: providerContentType,
          description,
          fileName,
          sourceStoredLocally: false,
          storageFallbackUsed: true,
          storageFallbackReason: error instanceof Error ? error.message : 'Asset mirror failed.',
        },
        model,
        position,
        provider,
        sourceArtifactUrl,
        thumbnailStorageKey: null,
        thumbnailUrl: sourceArtifactUrl,
      };
    }
  }

  private async getSourceVersion({
    draftId,
    sourceVersionNumber,
  }: {
    draftId: string;
    sourceVersionNumber?: number;
  }): Promise<ImageEditDraftVersionRow> {
    const result = await this.pool.query<ImageEditDraftVersionRow>(
      `SELECT
         d.id AS draft_id,
         d.status,
         d.current_version,
         v.id AS source_version_id,
         v.version_number AS source_version_number,
         v.image_url
       FROM drafts d
       JOIN versions v
         ON v.draft_id = d.id
        AND v.version_number = COALESCE($2, d.current_version)
       WHERE d.id = $1`,
      [draftId, sourceVersionNumber ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ServiceError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }
    if (row.status === 'release') {
      throw new ServiceError('DRAFT_RELEASED', 'Draft is released.', 409);
    }
    return row;
  }

  private getFalApiKey(): string {
    const apiKey = (process.env.FAL_API_KEY ?? env.FAL_API_KEY ?? '').trim();
    if (!apiKey) {
      throw new ServiceError(
        'IMAGE_EDIT_NOT_CONFIGURED',
        'fal image edit API key is not configured.',
        503,
      );
    }
    return apiKey;
  }

  private normalizeNumImages(value: number | undefined): number {
    if (!(typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value))) {
      return MIN_FAL_IMAGE_COUNT;
    }
    return Math.min(Math.max(value, MIN_FAL_IMAGE_COUNT), MAX_FAL_IMAGE_COUNT);
  }

  private appendLogsQuery(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}logs=1`;
  }

  private async fetchJson({
    body,
    headers,
    timeoutMs,
    url,
  }: {
    body?: Record<string, unknown>;
    headers: Record<string, string>;
    timeoutMs: number;
    url: string;
  }): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers,
        method: body ? 'POST' : 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        const raw = (await response.text()).trim();
        throw new ServiceError(
          'IMAGE_EDIT_REQUEST_FAILED',
          raw || `fal image edit request failed with status ${response.status}.`,
          response.status >= 500 ? 502 : response.status,
        );
      }
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async withTransaction<T>(
    client: DbClient | undefined,
    fn: (dbClient: DbClient) => Promise<T>,
  ): Promise<T> {
    if (client) {
      return fn(client);
    }

    const poolClient: PoolClient = await this.pool.connect();
    try {
      await poolClient.query('BEGIN');
      const result = await fn(poolClient);
      await poolClient.query('COMMIT');
      return result;
    } catch (error) {
      await poolClient.query('ROLLBACK');
      throw error;
    } finally {
      poolClient.release();
    }
  }
}

export const imageEditService = new ImageEditServiceImpl();
