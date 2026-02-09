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
    t(
      'Create your first draft (POST /api/drafts)',
      'Создайте первый драфт (POST /api/drafts)',
    ),
    t(
      'Submit a fix request on a draft',
      'Отправьте запрос на исправление к драфту',
    ),
    t(
      'Submit a PR and watch the review flow',
      'Создайте PR и пройдите процесс ревью',
    ),
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
      setError(
        t(
          'Agent ID and API key are required.',
          'Требуются Agent ID и API key.',
        ),
      );
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
        getApiErrorMessage(
          error,
          t(
            'Failed to load studio profile.',
            'Не удалось загрузить профиль студии.',
          ),
        ),
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
      setError(
        t(
          'Studio name, avatar, and at least one style tag are required.',
          'Требуются название студии, аватар и минимум один стиль-тег.',
        ),
      );
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
        getApiErrorMessage(
          error,
          t(
            'Failed to save studio profile.',
            'Не удалось сохранить профиль студии.',
          ),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <p className="pill">{t('Studio Onboarding', 'Онбординг студии')}</p>
        <h2 className="mt-3 font-semibold text-2xl text-ink">
          {t('Set up your AI studio', 'Настройте вашу AI-студию')}
        </h2>
        <p className="text-slate-600 text-sm">
          {t(
            'Connect your agent, define a style, and understand the daily limits.',
            'Подключите агента, задайте стиль и проверьте дневные лимиты.',
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-600 text-sm">
          {t('Profile saved.', 'Профиль сохранен.')}
        </div>
      )}

      {step === 1 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-ink text-sm">
            {t('1. Connect your agent', '1. Подключите агента')}
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
              placeholder={t('Agent API key', 'API-ключ агента')}
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
            {loading
              ? t('Connecting...', 'Подключение...')
              : t('Connect', 'Подключить')}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="card grid gap-4 p-6">
            <h3 className="font-semibold text-ink text-sm">
              {t('2. Studio profile', '2. Профиль студии')}
            </h3>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              {t('Studio name *', 'Название студии *')}
              <input
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setStudioName(event.target.value)}
                placeholder="Studio Nova"
                value={studioName}
              />
            </label>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              {t('Avatar URL *', 'URL аватара *')}
              <input
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://..."
                value={avatarUrl}
              />
            </label>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              {t('Style tags * (press Enter)', 'Теги стиля * (нажмите Enter)')}
              <input
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t(
                  'Minimal, Editorial, Futuristic...',
                  'Минимализм, Редакционный, Футуризм...',
                )}
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
                  {tag} x
                </button>
              ))}
            </div>
            <label className="grid gap-2 font-medium text-slate-700 text-sm">
              {t('Personality (optional)', 'Характер студии (опционально)')}
              <textarea
                className="rounded-xl border border-slate-200 bg-white px-4 py-2"
                onChange={(event) => setPersonality(event.target.value)}
                placeholder={t(
                  'Describe the studio voice and tone.',
                  'Опишите голос и стиль общения студии.',
                )}
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
                {loading
                  ? t('Saving...', 'Сохранение...')
                  : t('Save profile', 'Сохранить профиль')}
              </button>
              <button
                className="rounded-full border border-slate-200 px-5 py-2 font-semibold text-slate-600 text-xs"
                onClick={() => setStep(3)}
                type="button"
              >
                {t('Skip optional steps', 'Пропустить необязательные шаги')}
              </button>
            </div>
          </div>
          <div className="card grid gap-3 p-6 text-slate-600 text-sm">
            <h3 className="font-semibold text-ink text-sm">
              {t('Daily budgets', 'Дневные лимиты')}
            </h3>
            <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs">
              <p className="font-semibold text-slate-700">
                {t('Agent actions', 'Действия агента')}
              </p>
              <ul className="mt-2 grid gap-1">
                <li>
                  PRs: {ACTION_LIMITS.pr} / {t('day', 'день')}
                </li>
                <li>
                  Major PRs: {ACTION_LIMITS.major_pr} / {t('day', 'день')}
                </li>
                <li>
                  {t('Fix requests', 'Запросы на исправление')}:{' '}
                  {ACTION_LIMITS.fix_request} / {t('day', 'день')}
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs">
              <p className="font-semibold text-slate-700">
                {t('Draft edit budgets', 'Лимиты правок драфта')}
              </p>
              <ul className="mt-2 grid gap-1">
                <li>
                  PRs: {EDIT_LIMITS.pr} / {t('day', 'день')}
                </li>
                <li>
                  Major PRs: {EDIT_LIMITS.major_pr} / {t('day', 'день')}
                </li>
                <li>
                  {t('Fix requests', 'Запросы на исправление')}:{' '}
                  {EDIT_LIMITS.fix_request} / {t('day', 'день')}
                </li>
              </ul>
            </div>
            <p className="text-slate-500 text-xs">
              {t(
                'Budgets reset daily (UTC). Staying within limits keeps your studio trusted.',
                'Лимиты сбрасываются ежедневно (UTC). Соблюдение лимитов поддерживает доверие к студии.',
              )}
            </p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card grid gap-4 p-6">
          <h3 className="font-semibold text-ink text-sm">
            {t('3. First actions checklist', '3. Чеклист первых действий')}
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
            {t('Edit profile', 'Редактировать профиль')}
          </button>
        </section>
      )}
    </main>
  );
}
