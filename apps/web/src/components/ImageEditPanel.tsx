'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { apiClient } from '../lib/api';
import { getApiErrorMessage } from '../lib/errors';

type Translate = (key: string) => string;

type ImageEditJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
type ImageEditAspectRatio =
  | 'auto'
  | '21:9'
  | '16:9'
  | '3:2'
  | '4:3'
  | '5:4'
  | '1:1'
  | '4:5'
  | '3:4'
  | '2:3'
  | '9:16';

interface DraftVersionShape {
  imageUrl: string;
  versionNumber: number;
}

interface ImageEditCandidate {
  id: string;
  imageUrl: string;
  metadata: Record<string, unknown>;
  position: number;
  promotedPullRequestId: string | null;
  thumbnailUrl: string;
}

interface ImageEditJob {
  aspectRatio: ImageEditAspectRatio | null;
  candidates: ImageEditCandidate[];
  createdAt: string;
  failureMessage: string | null;
  id: string;
  numImages: number;
  prompt: string;
  sourceVersionNumber: number;
  status: ImageEditJobStatus;
}

interface PromoteDraft {
  description: string;
  severity: 'major' | 'minor';
}

interface ImageEditPanelProps {
  draftId: string;
  onPromoted?: () => void | Promise<void>;
  t: Translate;
  versions: DraftVersionShape[];
}

const IMAGE_EDIT_ASPECT_RATIOS: ImageEditAspectRatio[] = [
  'auto',
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16',
];

const fetchImageEditJobs = async (draftId: string): Promise<ImageEditJob[]> => {
  const response = await apiClient.get(`/drafts/${draftId}/image-edits`, {
    params: { refresh: 'active' },
  });
  return Array.isArray(response.data) ? response.data : [];
};

const isActiveJob = (job: ImageEditJob) => job.status === 'queued' || job.status === 'processing';

const getStatusTone = (status: ImageEditJobStatus) => {
  switch (status) {
    case 'completed':
      return 'bg-chart-2/14 text-chart-2';
    case 'failed':
      return 'bg-destructive/12 text-destructive';
    case 'processing':
      return 'bg-chart-3/16 text-chart-3';
    case 'queued':
    default:
      return 'bg-primary/12 text-primary';
  }
};

const getStatusLabel = (status: ImageEditJobStatus, t: Translate) => {
  switch (status) {
    case 'completed':
      return t('draftDetail.imageEdit.status.completed');
    case 'failed':
      return t('draftDetail.imageEdit.status.failed');
    case 'processing':
      return t('draftDetail.imageEdit.status.processing');
    case 'queued':
    default:
      return t('draftDetail.imageEdit.status.queued');
  }
};

const toCreatedAtLabel = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      });
};

export function ImageEditPanel({ draftId, onPromoted, t, versions }: ImageEditPanelProps) {
  const orderedVersions = useMemo(
    () => [...versions].sort((left, right) => right.versionNumber - left.versionNumber),
    [versions],
  );
  const defaultSourceVersion = orderedVersions[0]?.versionNumber ?? 1;
  const [prompt, setPrompt] = useState('');
  const [sourceVersionNumber, setSourceVersionNumber] = useState<string>(
    String(defaultSourceVersion),
  );
  const [numImages, setNumImages] = useState<string>('1');
  const [aspectRatio, setAspectRatio] = useState<ImageEditAspectRatio>('auto');
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [promoteDrafts, setPromoteDrafts] = useState<Record<string, PromoteDraft>>({});
  const [promotePendingCandidateId, setPromotePendingCandidateId] = useState<string | null>(null);
  const [promoteErrors, setPromoteErrors] = useState<Record<string, string>>({});
  const {
    data: jobsData,
    error: jobsError,
    isLoading,
    mutate: mutateJobs,
  } = useSWR<ImageEditJob[]>(
    draftId ? `draft:image-edits:${draftId}` : null,
    () => fetchImageEditJobs(draftId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const createJobKey = `draft:image-edits:create:${draftId || 'missing'}`;
  const promoteJobKey = `draft:image-edits:promote:${draftId || 'missing'}`;
  const { isMutating: createJobLoading, trigger: triggerCreateJob } = useSWRMutation<
    ImageEditJob,
    unknown,
    string,
    Record<string, unknown>
  >(createJobKey, async (_key, { arg }) => {
    const response = await apiClient.post(`/drafts/${draftId}/image-edits`, arg);
    return response.data as ImageEditJob;
  });
  const { trigger: triggerPromoteCandidate } = useSWRMutation<
    void,
    unknown,
    string,
    {
      candidateId: string;
      description: string;
      severity: 'major' | 'minor';
    }
  >(promoteJobKey, async (_key, { arg }) => {
    await apiClient.post(`/drafts/${draftId}/image-edits/candidates/${arg.candidateId}/promote`, {
      description: arg.description,
      severity: arg.severity,
    });
  });

  const jobs = Array.isArray(jobsData) ? jobsData : [];
  const hasActiveJobs = jobs.some(isActiveJob);

  useEffect(() => {
    setSourceVersionNumber((current) => {
      const exists = orderedVersions.some((version) => String(version.versionNumber) === current);
      return exists ? current : String(defaultSourceVersion);
    });
  }, [defaultSourceVersion, orderedVersions]);

  useEffect(() => {
    if (!hasActiveJobs) {
      return;
    }
    const timeout = window.setTimeout(() => {
      mutateJobs().catch(() => {
        // keep the current stale state visible on background refresh failures
      });
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [hasActiveJobs, jobs, mutateJobs]);

  const getPromoteDraft = (candidateId: string, job: ImageEditJob): PromoteDraft =>
    promoteDrafts[candidateId] ?? {
      description: `AI image edit candidate from v${job.sourceVersionNumber}: ${job.prompt}`,
      severity: 'minor',
    };

  const handleCreate = async () => {
    if (!draftId) {
      return;
    }
    setCreateError(null);
    setCreateStatus(null);
    try {
      await triggerCreateJob(
        {
          aspectRatio: aspectRatio === 'auto' ? undefined : aspectRatio,
          numImages: Number(numImages),
          prompt,
          sourceVersionNumber: Number(sourceVersionNumber),
        },
        { throwOnError: true },
      );
      setCreateStatus(t('draftDetail.imageEdit.status.submitted'));
      await mutateJobs();
    } catch (error: unknown) {
      setCreateError(getApiErrorMessage(error, t('draftDetail.imageEdit.errors.create')));
    }
  };

  const handlePromote = async (candidate: ImageEditCandidate, job: ImageEditJob) => {
    const promoteDraft = getPromoteDraft(candidate.id, job);
    setPromotePendingCandidateId(candidate.id);
    setPromoteErrors((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });
    try {
      await triggerPromoteCandidate(
        {
          candidateId: candidate.id,
          description: promoteDraft.description,
          severity: promoteDraft.severity,
        },
        { throwOnError: true },
      );
      await Promise.all([mutateJobs(), Promise.resolve(onPromoted?.())]);
    } catch (error: unknown) {
      setPromoteErrors((current) => ({
        ...current,
        [candidate.id]: getApiErrorMessage(error, t('draftDetail.imageEdit.errors.promote')),
      }));
    } finally {
      setPromotePendingCandidateId(null);
    }
  };

  return (
    <div className="card p-4 sm:p-5" data-testid="image-edit-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="pill">{t('draftDetail.imageEdit.pill')}</p>
          <h3 className="mt-3 font-semibold text-foreground text-sm">
            {t('draftDetail.imageEdit.title')}
          </h3>
        </div>
        <span className="text-muted-foreground text-xs">{t('draftDetail.imageEdit.subtitle')}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-muted-foreground text-xs">
          <span>{t('draftDetail.imageEdit.promptLabel')}</span>
          <textarea
            className="min-h-24 rounded-xl border border-border/25 bg-background/60 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t('draftDetail.imageEdit.promptPlaceholder')}
            value={prompt}
          />
        </label>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-muted-foreground text-xs">
            <span>{t('draftDetail.imageEdit.sourceVersionLabel')}</span>
            <select
              className="rounded-xl border border-border/25 bg-background/60 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onChange={(event) => setSourceVersionNumber(event.target.value)}
              value={sourceVersionNumber}
            >
              {orderedVersions.map((version) => (
                <option key={version.versionNumber} value={version.versionNumber}>
                  v{version.versionNumber}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-muted-foreground text-xs">
              <span>{t('draftDetail.imageEdit.numImagesLabel')}</span>
              <select
                className="rounded-xl border border-border/25 bg-background/60 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onChange={(event) => setNumImages(event.target.value)}
                value={numImages}
              >
                {[1, 2, 3, 4].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-muted-foreground text-xs">
              <span>{t('draftDetail.imageEdit.aspectRatioLabel')}</span>
              <select
                className="rounded-xl border border-border/25 bg-background/60 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onChange={(event) => setAspectRatio(event.target.value as ImageEditAspectRatio)}
                value={aspectRatio}
              >
                {IMAGE_EDIT_ASPECT_RATIOS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
            disabled={createJobLoading || prompt.trim().length === 0}
            onClick={handleCreate}
            type="button"
          >
            {createJobLoading
              ? t('draftDetail.imageEdit.creating')
              : t('draftDetail.imageEdit.create')}
          </button>
        </div>
      </div>

      {createStatus && <p className="mt-3 text-chart-2 text-xs">{createStatus}</p>}
      {createError && <p className="mt-3 text-destructive text-xs">{createError}</p>}
      {jobsError && (
        <p className="mt-3 text-destructive text-xs">
          {getApiErrorMessage(jobsError, t('draftDetail.imageEdit.errors.load'))}
        </p>
      )}
      {isLoading && (
        <p className="mt-4 text-muted-foreground text-xs">{t('draftDetail.imageEdit.loading')}</p>
      )}
      {!isLoading && jobs.length === 0 && (
        <p className="mt-4 text-muted-foreground text-xs">{t('draftDetail.imageEdit.empty')}</p>
      )}

      {jobs.length > 0 && (
        <div className="mt-4 grid gap-3">
          {jobs.map((job) => (
            <div
              className="rounded-2xl border border-border/25 bg-background/58 p-3 sm:p-4"
              key={job.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground text-sm">{job.prompt}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t('draftDetail.imageEdit.metaPrefix')} v{job.sourceVersionNumber} •{' '}
                    {job.numImages} {t('draftDetail.imageEdit.metaCandidates')} •{' '}
                    {toCreatedAtLabel(job.createdAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 font-semibold text-xs ${getStatusTone(
                    job.status,
                  )}`}
                >
                  {getStatusLabel(job.status, t)}
                </span>
              </div>

              {job.failureMessage && (
                <p className="mt-2 text-destructive text-xs">{job.failureMessage}</p>
              )}

              {job.candidates.length > 0 && (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {job.candidates.map((candidate) => {
                    const promoteDraft = getPromoteDraft(candidate.id, job);
                    const isPromoted = Boolean(candidate.promotedPullRequestId);
                    const promoteError = promoteErrors[candidate.id];
                    return (
                      <div
                        className="rounded-2xl border border-border/20 bg-background/78 p-3"
                        key={candidate.id}
                      >
                        <div className="overflow-hidden rounded-xl border border-border/20 bg-muted/30">
                          <img
                            alt=""
                            className="h-48 w-full object-cover"
                            src={candidate.imageUrl}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground text-sm">
                            {t('draftDetail.imageEdit.candidateLabel')} #{candidate.position}
                          </p>
                          {isPromoted ? (
                            <Link
                              className="rounded-full border border-chart-2/40 bg-chart-2/10 px-3 py-1 font-semibold text-chart-2 text-xs"
                              href="#pull-requests"
                              scroll={false}
                            >
                              {t('draftDetail.imageEdit.promoted')}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {t('draftDetail.imageEdit.pendingPromotion')}
                            </span>
                          )}
                        </div>
                        <label className="mt-3 grid gap-1.5 text-muted-foreground text-xs">
                          <span>{t('draftDetail.imageEdit.prDescriptionLabel')}</span>
                          <textarea
                            className="min-h-20 rounded-xl border border-border/25 bg-background/60 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            disabled={isPromoted}
                            onChange={(event) =>
                              setPromoteDrafts((current) => ({
                                ...current,
                                [candidate.id]: {
                                  ...promoteDraft,
                                  description: event.target.value,
                                },
                              }))
                            }
                            value={promoteDraft.description}
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="grid gap-1.5 text-muted-foreground text-xs">
                            <span>{t('draftDetail.imageEdit.prSeverityLabel')}</span>
                            <select
                              className="rounded-xl border border-border/25 bg-background/60 px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                              disabled={isPromoted}
                              onChange={(event) =>
                                setPromoteDrafts((current) => ({
                                  ...current,
                                  [candidate.id]: {
                                    ...promoteDraft,
                                    severity: event.target.value as 'major' | 'minor',
                                  },
                                }))
                              }
                              value={promoteDraft.severity}
                            >
                              <option value="minor">
                                {t('draftDetail.imageEdit.severity.minor')}
                              </option>
                              <option value="major">
                                {t('draftDetail.imageEdit.severity.major')}
                              </option>
                            </select>
                          </label>
                          <button
                            className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                            disabled={
                              isPromoted ||
                              promotePendingCandidateId === candidate.id ||
                              promoteDraft.description.trim().length === 0
                            }
                            onClick={() => handlePromote(candidate, job)}
                            type="button"
                          >
                            {promotePendingCandidateId === candidate.id
                              ? t('draftDetail.imageEdit.promoting')
                              : t('draftDetail.imageEdit.promote')}
                          </button>
                        </div>
                        {promoteError && (
                          <p className="mt-2 text-destructive text-xs">{promoteError}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
