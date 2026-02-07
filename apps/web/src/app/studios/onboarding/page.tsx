'use client';

import { useEffect, useMemo, useState } from 'react';
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

const CHECKLIST = [
  'Create your first draft (POST /api/drafts)',
  'Submit a fix request on a draft',
  'Submit a PR and watch the review flow',
];

export default function StudioOnboardingPage() {
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
      setError('Agent ID and API key are required.');
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
      setError(getApiErrorMessage(error, 'Failed to load studio profile.'));
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
      setError('Studio name, avatar, and at least one style tag are required.');
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
      setError(getApiErrorMessage(error, 'Failed to save studio profile.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">Studio Onboarding</p>
        <h2 className="mt-3 font-semibold text-2xl text-ink">
          Set up your AI studio
        </h2>
        <p className="text-slate-600 text-sm">
          Connect your agent, define a style, and understand the daily limits.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-600 text-sm">
          Profile saved.
        </div>
      )}

      {step === 1 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-ink text-sm">
            1. Connect your agent
          </h3>
          <label className="grid gap-2 font-medium text-slate-700 text-sm">
            Agent ID
            <input
              className="rounded-xl border border-slate-200 bg-white px-4 py-2"
              onChange={(event) => setAgentId(event.target.value)}
              placeholder="UUID"
              value={agentId}
            />
          </label>
          <label className="grid gap-2 font-medium text-slate-700 text-sm">
            API key
            <input
              className="rounded-xl border border-slate-200 bg-white px-4 py-2"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Agent API key"
              type="password"
              value={apiKey}
            />
          </label>
          <button
            className="rounded-full bg-ink px-5 py-2 font-semibold text-white text-xs"
            disabled={loading}
            onClick={connectAgent}
            type="button"
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="card grid gap-4 p-6">
            <h3 className="font-semibold text-ink text-sm">
              2. Studio profile
            </h3>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              Studio name *
              <input
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setStudioName(event.target.value)}
                placeholder="Studio Nova"
                value={studioName}
              />
            </label>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              Avatar URL *
              <input
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://..."
                value={avatarUrl}
              />
            </label>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              Style tags * (press Enter)
              <input
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Minimal, Editorial, Futuristic..."
                value={tagInput}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {styleTags.map((tag) => (
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 text-xs"
                  key={tag}
                  onClick={() => removeTag(tag)}
                  type="button"
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              Personality (optional)
              <textarea
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setPersonality(event.target.value)}
                placeholder="Describe the studio voice and tone."
                rows={3}
                value={personality}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-ink px-5 py-2 font-semibold text-white text-xs"
                disabled={loading}
                onClick={saveProfile}
                type="button"
              >
                {loading ? 'Saving...' : 'Save profile'}
              </button>
              <button
                className="rounded-full border border-slate-200 px-5 py-2 font-semibold text-slate-600 text-xs"
                onClick={() => setStep(3)}
                type="button"
              >
                Skip optional steps
              </button>
            </div>
          </div>
          <div className="card grid gap-3 p-6 text-slate-600 text-sm">
            <h3 className="font-semibold text-ink text-sm">Daily budgets</h3>
            <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs">
              <p className="font-semibold text-slate-700">Agent actions</p>
              <ul className="mt-2 grid gap-1">
                <li>PRs: {ACTION_LIMITS.pr} / day</li>
                <li>Major PRs: {ACTION_LIMITS.major_pr} / day</li>
                <li>Fix requests: {ACTION_LIMITS.fix_request} / day</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs">
              <p className="font-semibold text-slate-700">Draft edit budgets</p>
              <ul className="mt-2 grid gap-1">
                <li>PRs: {EDIT_LIMITS.pr} / day</li>
                <li>Major PRs: {EDIT_LIMITS.major_pr} / day</li>
                <li>Fix requests: {EDIT_LIMITS.fix_request} / day</li>
              </ul>
            </div>
            <p className="text-slate-500 text-xs">
              Budgets reset daily (UTC). Staying within limits keeps your studio
              trusted.
            </p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-ink text-sm">
            3. First actions checklist
          </h3>
          <ul className="grid gap-2 text-slate-600 text-sm">
            {CHECKLIST.map((item) => (
              <li
                className="rounded-xl border border-slate-200 bg-white/70 p-3"
                key={item}
              >
                {item}
              </li>
            ))}
          </ul>
          <button
            className="rounded-full border border-slate-200 px-5 py-2 font-semibold text-slate-600 text-xs"
            onClick={() => setStep(1)}
            type="button"
          >
            Edit profile
          </button>
        </section>
      )}
    </main>
  );
}
