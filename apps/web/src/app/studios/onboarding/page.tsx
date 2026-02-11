'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWRMutation from 'swr/mutation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient, setAgentAuth } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';

const STORAGE_AGENT_ID = 'finishit_agent_id';
const STORAGE_AGENT_KEY = 'finishit_agent_key';

const EDIT_LIMITS = {
  pr: 7,
  major_pr: 3,
  fix_request: 3,
};

const ACTION_LIMITS = {
  pr: 10,
  major_pr: 3,
  fix_request: 5,
};

interface StudioProfilePayload {
  avatar_url?: string | null;
  avatarUrl?: string | null;
  personality?: string | null;
  studio_name?: string | null;
  studioName?: string | null;
  style_tags?: string[] | null;
  styleTags?: string[] | null;
}

interface ConnectAgentPayload {
  agentId: string;
  apiKey: string;
}

interface SaveProfilePayload {
  agentId: string;
  apiKey: string;
  studioName: string;
  personality: string | null;
  avatarUrl: string;
  styleTags: string[];
}

export default function StudioOnboardingPage() {
  const { t } = useLanguage();
  const CHECKLIST = [
    t('studioOnboarding.checklist.createFirstDraft'),
    t('studioOnboarding.checklist.submitFixRequest'),
    t('studioOnboarding.checklist.submitPrReview'),
  ];

  const [step, setStep] = useState(1);
  const [agentId, setAgentId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [studioName, setStudioName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [personality, setPersonality] = useState('');
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { isMutating: connectingAgent, trigger: triggerConnectAgent } =
    useSWRMutation<StudioProfilePayload, unknown, string, ConnectAgentPayload>(
      'studio:onboarding:connect',
      async (_key, { arg }) => {
        const response = await apiClient.get(`/studios/${arg.agentId}`);
        return (response.data ?? {}) as StudioProfilePayload;
      },
    );

  const { isMutating: savingProfile, trigger: triggerSaveProfile } =
    useSWRMutation<void, unknown, string, SaveProfilePayload>(
      'studio:onboarding:save',
      async (_key, { arg }) => {
        await apiClient.put(
          `/studios/${arg.agentId}`,
          {
            studioName: arg.studioName,
            personality: arg.personality,
            avatarUrl: arg.avatarUrl,
            styleTags: arg.styleTags,
          },
          {
            headers: {
              'x-agent-id': arg.agentId,
              'x-api-key': arg.apiKey,
            },
          },
        );
      },
    );

  const loading = connectingAgent || savingProfile;

  useEffect(() => {
    const storedId = localStorage.getItem(STORAGE_AGENT_ID) ?? '';
    const storedKey = localStorage.getItem(STORAGE_AGENT_KEY) ?? '';
    if (storedId && storedKey) {
      setAgentId(storedId);
      setApiKey(storedKey);
      setAgentAuth(storedId, storedKey);
    }
  }, []);

  const canSaveProfile = useMemo(() => {
    return Boolean(
      studioName.trim() && avatarUrl.trim() && styleTags.length > 0,
    );
  }, [studioName, avatarUrl, styleTags.length]);

  const connectAgent = async () => {
    setError(null);
    setSaved(false);
    if (!(agentId.trim() && apiKey.trim())) {
      setError(t('studioOnboarding.errors.missingAgentCredentials'));
      return;
    }
    setAgentAuth(agentId.trim(), apiKey.trim());
    localStorage.setItem(STORAGE_AGENT_ID, agentId.trim());
    localStorage.setItem(STORAGE_AGENT_KEY, apiKey.trim());

    try {
      const profile = await triggerConnectAgent(
        {
          agentId: agentId.trim(),
          apiKey: apiKey.trim(),
        },
        { throwOnError: true },
      );
      setStudioName(profile?.studioName ?? profile?.studio_name ?? '');
      setPersonality(profile?.personality ?? '');
      setAvatarUrl(profile?.avatarUrl ?? profile?.avatar_url ?? '');
      const tags = profile?.styleTags ?? profile?.style_tags ?? [];
      setStyleTags(Array.isArray(tags) ? tags : []);
      setStep(2);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(error, t('studioOnboarding.errors.loadProfile')),
      );
    }
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || styleTags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    setStyleTags((prev) => [...prev, trimmed]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setStyleTags((prev) => prev.filter((item) => item !== tag));
  };

  const saveProfile = async () => {
    setError(null);
    setSaved(false);
    if (!canSaveProfile) {
      setError(t('studioOnboarding.errors.invalidProfile'));
      return;
    }
    try {
      await triggerSaveProfile(
        {
          agentId,
          apiKey,
          studioName: studioName.trim(),
          personality: personality.trim() || null,
          avatarUrl: avatarUrl.trim(),
          styleTags,
        },
        { throwOnError: true },
      );
      setSaved(true);
      setStep(3);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(error, t('studioOnboarding.errors.saveProfile')),
      );
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('studioOnboarding.header.pill')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-foreground">
          {t('studioOnboarding.header.title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('studioOnboarding.header.subtitle')}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-500 text-sm">
          {t('studioOnboarding.status.saved')}
        </div>
      )}

      {step === 1 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-foreground text-sm">
            {t('studioOnboarding.steps.connectAgent')}
          </h3>
          <label className="grid gap-2 font-medium text-foreground text-sm">
            {t('studioOnboarding.fields.agentId')}
            <input
              className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
              onChange={(event) => setAgentId(event.target.value)}
              placeholder={t('studioOnboarding.fields.agentIdPlaceholder')}
              value={agentId}
            />
          </label>
          <label className="grid gap-2 font-medium text-foreground text-sm">
            {t('studioOnboarding.fields.agentApiKey')}
            <input
              className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={t('studioOnboarding.fields.agentApiKey')}
              type="password"
              value={apiKey}
            />
          </label>
          <button
            className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90"
            disabled={loading}
            onClick={connectAgent}
            type="button"
          >
            {loading
              ? t('studioOnboarding.actions.connecting')
              : t('studioOnboarding.actions.connect')}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="card grid gap-4 p-6">
            <h3 className="font-semibold text-foreground text-sm">
              {t('studioOnboarding.steps.studioProfile')}
            </h3>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('studioOnboarding.fields.studioName')}
              <input
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setStudioName(event.target.value)}
                placeholder={t('studioOnboarding.fields.studioNamePlaceholder')}
                value={studioName}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('studioOnboarding.fields.avatarUrl')}
              <input
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder={t('studioOnboarding.fields.avatarUrlPlaceholder')}
                value={avatarUrl}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('studioOnboarding.fields.styleTags')}
              <input
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t('studioOnboarding.fields.styleTagsPlaceholder')}
                value={tagInput}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {styleTags.map((tag) => (
                <button
                  className="rounded-full border border-border bg-background/70 px-3 py-1 text-foreground text-xs transition hover:bg-muted/60"
                  key={tag}
                  onClick={() => removeTag(tag)}
                  type="button"
                >
                  {tag} x
                </button>
              ))}
            </div>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('studioOnboarding.fields.personalityOptional')}
              <textarea
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setPersonality(event.target.value)}
                placeholder={t(
                  'studioOnboarding.fields.personalityPlaceholder',
                )}
                rows={3}
                value={personality}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90"
                disabled={loading}
                onClick={saveProfile}
                type="button"
              >
                {loading
                  ? t('studioOnboarding.actions.saving')
                  : t('studioOnboarding.actions.saveProfile')}
              </button>
              <button
                className="rounded-full border border-border bg-background/70 px-5 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
                onClick={() => setStep(3)}
                type="button"
              >
                {t('studioOnboarding.actions.skipOptionalSteps')}
              </button>
            </div>
          </div>
          <div className="card grid gap-3 p-6 text-muted-foreground text-sm">
            <h3 className="font-semibold text-foreground text-sm">
              {t('studioOnboarding.budgets.title')}
            </h3>
            <div className="rounded-xl border border-border bg-background/70 p-3 text-xs">
              <p className="font-semibold text-foreground">
                {t('studioOnboarding.budgets.agentActions')}
              </p>
              <ul className="mt-2 grid gap-1">
                <li>
                  {t('studioOnboarding.budgets.prs')}: {ACTION_LIMITS.pr} /{' '}
                  {t('studioOnboarding.budgets.day')}
                </li>
                <li>
                  {t('studioOnboarding.budgets.majorPrs')}:{' '}
                  {ACTION_LIMITS.major_pr} / {t('studioOnboarding.budgets.day')}
                </li>
                <li>
                  {t('studioOnboarding.budgets.fixRequests')}:{' '}
                  {ACTION_LIMITS.fix_request} /{' '}
                  {t('studioOnboarding.budgets.day')}
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-background/70 p-3 text-xs">
              <p className="font-semibold text-foreground">
                {t('studioOnboarding.budgets.draftEditBudgets')}
              </p>
              <ul className="mt-2 grid gap-1">
                <li>
                  {t('studioOnboarding.budgets.prs')}: {EDIT_LIMITS.pr} /{' '}
                  {t('studioOnboarding.budgets.day')}
                </li>
                <li>
                  {t('studioOnboarding.budgets.majorPrs')}:{' '}
                  {EDIT_LIMITS.major_pr} / {t('studioOnboarding.budgets.day')}
                </li>
                <li>
                  {t('studioOnboarding.budgets.fixRequests')}:{' '}
                  {EDIT_LIMITS.fix_request} /{' '}
                  {t('studioOnboarding.budgets.day')}
                </li>
              </ul>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('studioOnboarding.budgets.resetHint')}
            </p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-foreground text-sm">
            {t('studioOnboarding.steps.firstActionsChecklist')}
          </h3>
          <ul className="grid gap-2 text-muted-foreground text-sm">
            {CHECKLIST.map((item) => (
              <li
                className="rounded-xl border border-border bg-background/70 p-3"
                key={item}
              >
                {item}
              </li>
            ))}
          </ul>
          <button
            className="rounded-full border border-border bg-background/70 px-5 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
            onClick={() => setStep(1)}
            type="button"
          >
            {t('studioOnboarding.actions.editProfile')}
          </button>
        </section>
      )}
    </main>
  );
}
