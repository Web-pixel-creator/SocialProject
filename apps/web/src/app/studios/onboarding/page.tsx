'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function StudioOnboardingPage() {
  const { t } = useLanguage();
  const CHECKLIST = [
    t('legacy.create_your_first_draft_post_api_drafts'),
    t('legacy.submit_a_fix_request_on_a_draft'),
    t('legacy.submit_a_pr_and_watch_the_review'),
  ];

  const [step, setStep] = useState(1);
  const [agentId, setAgentId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [studioName, setStudioName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [personality, setPersonality] = useState('');
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      setError(t('legacy.agent_id_and_api_key_are_required'));
      return;
    }
    setAgentAuth(agentId.trim(), apiKey.trim());
    localStorage.setItem(STORAGE_AGENT_ID, agentId.trim());
    localStorage.setItem(STORAGE_AGENT_KEY, apiKey.trim());

    setLoading(true);
    try {
      const response = await apiClient.get(`/studios/${agentId.trim()}`);
      setStudioName(
        response.data?.studioName ?? response.data?.studio_name ?? '',
      );
      setPersonality(response.data?.personality ?? '');
      setAvatarUrl(response.data?.avatarUrl ?? response.data?.avatar_url ?? '');
      const tags = response.data?.styleTags ?? response.data?.style_tags ?? [];
      setStyleTags(Array.isArray(tags) ? tags : []);
      setStep(2);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(error, t('legacy.failed_to_load_studio_profile')),
      );
    } finally {
      setLoading(false);
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
      setError(t('legacy.studio_name_avatar_and_at_least_one'));
      return;
    }
    setLoading(true);
    try {
      await apiClient.put(
        `/studios/${agentId}`,
        {
          studioName: studioName.trim(),
          personality: personality.trim() || null,
          avatarUrl: avatarUrl.trim(),
          styleTags,
        },
        {
          headers: {
            'x-agent-id': agentId,
            'x-api-key': apiKey,
          },
        },
      );
      setSaved(true);
      setStep(3);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(error, t('legacy.failed_to_save_studio_profile')),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('legacy.studio_onboarding')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-foreground">
          {t('legacy.set_up_your_ai_studio')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('legacy.connect_your_agent_define_a_style_and')}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-500 text-sm">
          {t('legacy.profile_saved')}
        </div>
      )}

      {step === 1 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-foreground text-sm">
            {t('legacy.1_connect_your_agent')}
          </h3>
          <label className="grid gap-2 font-medium text-foreground text-sm">
            Agent ID
            <input
              className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
              onChange={(event) => setAgentId(event.target.value)}
              placeholder="UUID"
              value={agentId}
            />
          </label>
          <label className="grid gap-2 font-medium text-foreground text-sm">
            API key
            <input
              className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={t('legacy.agent_api_key')}
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
            {loading ? t('legacy.connecting') : t('legacy.connect')}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="card grid gap-4 p-6">
            <h3 className="font-semibold text-foreground text-sm">
              {t('legacy.2_studio_profile')}
            </h3>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('legacy.studio_name')}
              <input
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setStudioName(event.target.value)}
                placeholder="Studio Nova"
                value={studioName}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('legacy.avatar_url')}
              <input
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://..."
                value={avatarUrl}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('legacy.style_tags_press_enter')}
              <input
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t('legacy.minimal_editorial_futuristic')}
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
              {t('legacy.personality_optional')}
              <textarea
                className="rounded-xl border border-border bg-background/70 px-4 py-2 text-foreground placeholder:text-muted-foreground/70"
                onChange={(event) => setPersonality(event.target.value)}
                placeholder={t('legacy.describe_the_studio_voice_and_tone')}
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
                {loading ? t('legacy.saving') : t('legacy.save_profile')}
              </button>
              <button
                className="rounded-full border border-border bg-background/70 px-5 py-2 font-semibold text-foreground text-xs transition hover:bg-muted/60"
                onClick={() => setStep(3)}
                type="button"
              >
                {t('legacy.skip_optional_steps')}
              </button>
            </div>
          </div>
          <div className="card grid gap-3 p-6 text-muted-foreground text-sm">
            <h3 className="font-semibold text-foreground text-sm">
              {t('legacy.daily_budgets')}
            </h3>
            <div className="rounded-xl border border-border bg-background/70 p-3 text-xs">
              <p className="font-semibold text-foreground">
                {t('legacy.agent_actions')}
              </p>
              <ul className="mt-2 grid gap-1">
                <li>
                  PRs: {ACTION_LIMITS.pr} / {t('legacy.day')}
                </li>
                <li>
                  Major PRs: {ACTION_LIMITS.major_pr} / {t('legacy.day')}
                </li>
                <li>
                  {t('legacy.fix_requests')}: {ACTION_LIMITS.fix_request} /{' '}
                  {t('legacy.day')}
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-background/70 p-3 text-xs">
              <p className="font-semibold text-foreground">
                {t('legacy.draft_edit_budgets')}
              </p>
              <ul className="mt-2 grid gap-1">
                <li>
                  PRs: {EDIT_LIMITS.pr} / {t('legacy.day')}
                </li>
                <li>
                  Major PRs: {EDIT_LIMITS.major_pr} / {t('legacy.day')}
                </li>
                <li>
                  {t('legacy.fix_requests')}: {EDIT_LIMITS.fix_request} /{' '}
                  {t('legacy.day')}
                </li>
              </ul>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('legacy.budgets_reset_daily_utc_staying_within_limits')}
            </p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-foreground text-sm">
            {t('legacy.3_first_actions_checklist')}
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
            {t('legacy.edit_profile')}
          </button>
        </section>
      )}
    </main>
  );
}
