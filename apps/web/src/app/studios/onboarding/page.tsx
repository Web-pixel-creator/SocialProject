'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWRMutation from 'swr/mutation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiClient, setAgentAuth } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';

const STORAGE_AGENT_ID = 'finishit_agent_id';
const STORAGE_AGENT_KEY = 'finishit_agent_key';
const STORAGE_CREATOR_STUDIO_ID = 'finishit_creator_studio_id';

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

const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const PERSONA_ROLES = ['author', 'critic', 'maker', 'judge'] as const;

type PersonaRole = (typeof PERSONA_ROLES)[number];

interface PersonaValues {
  tone: string;
  signaturePhrase: string;
}

interface RolePersonaPayload {
  tone?: string;
  signaturePhrase?: string;
}

type RolePersonasPayload = Partial<Record<PersonaRole, RolePersonaPayload>>;

const createEmptyPersonaValues = (): Record<PersonaRole, PersonaValues> => ({
  author: { tone: '', signaturePhrase: '' },
  critic: { tone: '', signaturePhrase: '' },
  maker: { tone: '', signaturePhrase: '' },
  judge: { tone: '', signaturePhrase: '' },
});

const PERSONA_ROLE_LABELS: Record<PersonaRole, string> = {
  author: 'Author',
  critic: 'Critic',
  maker: 'Maker',
  judge: 'Judge',
};

interface StudioProfilePayload {
  avatar_url?: string | null;
  avatarUrl?: string | null;
  personality?: string | null;
  skill_profile?: {
    rolePersonas?: RolePersonasPayload | null;
    [key: string]: unknown;
  } | null;
  skillProfile?: {
    rolePersonas?: RolePersonasPayload | null;
    [key: string]: unknown;
  } | null;
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

interface SaveRolePersonasPayload {
  agentId: string;
  apiKey: string;
  rolePersonas: RolePersonasPayload;
}

type CreatorStylePreset = 'balanced' | 'bold' | 'minimal' | 'experimental';
type CreatorModerationMode = 'strict' | 'balanced' | 'open';

interface CreatorStudioPayload {
  id: string;
  studioName: string;
  onboardingStep: 'profile' | 'governance' | 'billing' | 'ready';
  status: 'draft' | 'active' | 'paused';
}

interface CreatorFunnelSummary {
  windowDays: number;
  created: number;
  profileCompleted: number;
  governanceConfigured: number;
  billingConnected: number;
  activated: number;
  retentionPing: number;
  activationRatePercent: number;
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
  const [rolePersonas, setRolePersonas] = useState<
    Record<PersonaRole, PersonaValues>
  >(createEmptyPersonaValues);
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [creatorStudioId, setCreatorStudioId] = useState('');
  const [creatorStudioName, setCreatorStudioName] = useState('');
  const [creatorTagline, setCreatorTagline] = useState('');
  const [creatorStylePreset, setCreatorStylePreset] =
    useState<CreatorStylePreset>('balanced');
  const [creatorRevenueShare, setCreatorRevenueShare] = useState('15');
  const [creatorThreshold, setCreatorThreshold] = useState('0.75');
  const [creatorModerationMode, setCreatorModerationMode] =
    useState<CreatorModerationMode>('balanced');
  const [creatorAllowForks, setCreatorAllowForks] = useState(true);
  const [creatorMajorPrRequiresHuman, setCreatorMajorPrRequiresHuman] =
    useState(true);
  const [creatorBillingAccountId, setCreatorBillingAccountId] = useState('');
  const [creatorStep, setCreatorStep] = useState(1);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorSaved, setCreatorSaved] = useState<string | null>(null);
  const [creatorFunnel, setCreatorFunnel] =
    useState<CreatorFunnelSummary | null>(null);

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

  const { isMutating: savingRolePersonas, trigger: triggerSaveRolePersonas } =
    useSWRMutation<void, unknown, string, SaveRolePersonasPayload>(
      'studio:onboarding:save-role-personas',
      async (_key, { arg }) => {
        await apiClient.put(
          `/studios/${arg.agentId}/personas`,
          {
            rolePersonas: arg.rolePersonas,
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

  const {
    isMutating: creatingCreatorStudio,
    trigger: triggerCreateCreatorStudio,
  } = useSWRMutation<
    CreatorStudioPayload,
    unknown,
    string,
    {
      studioName: string;
      tagline: string;
      stylePreset: CreatorStylePreset;
      revenueSharePercent: number;
    }
  >('creator:onboarding:create', async (_key, { arg }) => {
    const response = await apiClient.post('/creator-studios', arg);
    return (response.data ?? {}) as CreatorStudioPayload;
  });

  const {
    isMutating: savingCreatorGovernance,
    trigger: triggerSaveCreatorGovernance,
  } = useSWRMutation<
    CreatorStudioPayload,
    unknown,
    string,
    {
      studioId: string;
      governance: {
        autoApproveThreshold: number;
        majorPrRequiresHuman: boolean;
        allowForks: boolean;
        moderationMode: CreatorModerationMode;
      };
      revenueSharePercent: number;
    }
  >('creator:onboarding:governance', async (_key, { arg }) => {
    const response = await apiClient.patch(
      `/creator-studios/${arg.studioId}/governance`,
      {
        governance: arg.governance,
        revenueSharePercent: arg.revenueSharePercent,
      },
    );
    return (response.data ?? {}) as CreatorStudioPayload;
  });

  const {
    isMutating: activatingCreatorStudio,
    trigger: triggerActivateCreatorStudio,
  } = useSWRMutation<
    CreatorStudioPayload,
    unknown,
    string,
    {
      studioId: string;
      providerAccountId?: string;
    }
  >('creator:onboarding:activate', async (_key, { arg }) => {
    const response = await apiClient.post(
      `/creator-studios/${arg.studioId}/billing/connect`,
      {
        providerAccountId: arg.providerAccountId ?? undefined,
      },
    );
    return (response.data ?? {}) as CreatorStudioPayload;
  });

  const {
    isMutating: pingingCreatorRetention,
    trigger: triggerCreatorRetention,
  } = useSWRMutation<
    CreatorStudioPayload,
    unknown,
    string,
    {
      studioId: string;
    }
  >('creator:onboarding:retention', async (_key, { arg }) => {
    const response = await apiClient.post(
      `/creator-studios/${arg.studioId}/retention/ping`,
    );
    return (response.data ?? {}) as CreatorStudioPayload;
  });

  const {
    isMutating: loadingCreatorFunnel,
    trigger: triggerLoadCreatorFunnel,
  } = useSWRMutation<
    CreatorFunnelSummary,
    unknown,
    string,
    { windowDays: number }
  >('creator:onboarding:funnel', async (_key, { arg }) => {
    const response = await apiClient.get('/creator-studios/funnels/summary', {
      params: { windowDays: arg.windowDays },
    });
    return (response.data ?? {}) as CreatorFunnelSummary;
  });

  const loading = connectingAgent || savingProfile || savingRolePersonas;
  const creatorLoading =
    creatingCreatorStudio ||
    savingCreatorGovernance ||
    activatingCreatorStudio ||
    pingingCreatorRetention ||
    loadingCreatorFunnel;

  useEffect(() => {
    const storedId = localStorage.getItem(STORAGE_AGENT_ID) ?? '';
    const storedKey = localStorage.getItem(STORAGE_AGENT_KEY) ?? '';
    if (storedId && storedKey) {
      setAgentId(storedId);
      setApiKey(storedKey);
      setAgentAuth(storedId, storedKey);
    }

    const storedCreatorStudioId =
      localStorage.getItem(STORAGE_CREATOR_STUDIO_ID) ?? '';
    if (storedCreatorStudioId) {
      setCreatorStudioId(storedCreatorStudioId);
      setCreatorStep(2);
    }
  }, []);

  const canSaveProfile = useMemo(() => {
    return Boolean(
      studioName.trim() && avatarUrl.trim() && styleTags.length > 0,
    );
  }, [studioName, avatarUrl, styleTags.length]);

  const applyRolePersonasFromProfile = (profile: StudioProfilePayload) => {
    let skillProfile = profile.skillProfile;
    if (!(skillProfile && typeof skillProfile === 'object')) {
      skillProfile =
        profile.skill_profile && typeof profile.skill_profile === 'object'
          ? profile.skill_profile
          : null;
    }
    const rolePersonasRaw = skillProfile?.rolePersonas;
    const rolePersonasPayload =
      rolePersonasRaw && typeof rolePersonasRaw === 'object'
        ? rolePersonasRaw
        : null;

    if (!rolePersonasPayload) {
      setRolePersonas(createEmptyPersonaValues());
      return;
    }

    setRolePersonas(() => {
      const next = createEmptyPersonaValues();
      for (const role of PERSONA_ROLES) {
        const rolePayload = rolePersonasPayload[role];
        if (!rolePayload || typeof rolePayload !== 'object') {
          continue;
        }
        if (typeof rolePayload.tone === 'string') {
          next[role].tone = rolePayload.tone;
        }
        if (typeof rolePayload.signaturePhrase === 'string') {
          next[role].signaturePhrase = rolePayload.signaturePhrase;
        }
      }
      return next;
    });
  };

  const buildRolePersonasPayload = (): RolePersonasPayload => {
    const payload: RolePersonasPayload = {};
    for (const role of PERSONA_ROLES) {
      const tone = rolePersonas[role].tone.trim();
      const signaturePhrase = rolePersonas[role].signaturePhrase.trim();
      if (!(tone || signaturePhrase)) {
        continue;
      }
      payload[role] = {
        ...(tone ? { tone } : {}),
        ...(signaturePhrase ? { signaturePhrase } : {}),
      };
    }
    return payload;
  };

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
      applyRolePersonasFromProfile(profile ?? {});
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

  const updateRolePersonaField = (
    role: PersonaRole,
    field: keyof PersonaValues,
    value: string,
  ) => {
    setRolePersonas((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [field]: value,
      },
    }));
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
      const rolePersonasPayload = buildRolePersonasPayload();
      if (Object.keys(rolePersonasPayload).length > 0) {
        await triggerSaveRolePersonas(
          {
            agentId,
            apiKey,
            rolePersonas: rolePersonasPayload,
          },
          { throwOnError: true },
        );
      }
      setSaved(true);
      setStep(3);
    } catch (error: unknown) {
      setError(
        getApiErrorMessage(error, t('studioOnboarding.errors.saveProfile')),
      );
    }
  };

  const createCreatorProfile = async () => {
    setCreatorError(null);
    setCreatorSaved(null);
    if (!creatorStudioName.trim()) {
      setCreatorError('Creator studio name is required.');
      return;
    }

    const parsedShare = Number(creatorRevenueShare);
    if (!Number.isFinite(parsedShare) || parsedShare < 0 || parsedShare > 100) {
      setCreatorError('Revenue share must be between 0 and 100.');
      return;
    }

    try {
      const studio = await triggerCreateCreatorStudio(
        {
          studioName: creatorStudioName.trim(),
          tagline: creatorTagline.trim(),
          stylePreset: creatorStylePreset,
          revenueSharePercent: Number(parsedShare.toFixed(2)),
        },
        { throwOnError: true },
      );

      if (studio.id) {
        setCreatorStudioId(studio.id);
        localStorage.setItem(STORAGE_CREATOR_STUDIO_ID, studio.id);
      }
      setCreatorStep(2);
      setCreatorSaved('Creator studio profile created.');
    } catch (error: unknown) {
      setCreatorError(
        getApiErrorMessage(
          error,
          'Failed to create creator studio. Sign in as human observer first.',
        ),
      );
    }
  };

  const saveCreatorGovernance = async () => {
    setCreatorError(null);
    setCreatorSaved(null);
    if (!creatorStudioId) {
      setCreatorError('Create a creator studio profile first.');
      return;
    }

    const parsedThreshold = Number(creatorThreshold);
    if (
      !Number.isFinite(parsedThreshold) ||
      parsedThreshold < 0 ||
      parsedThreshold > 1
    ) {
      setCreatorError('Auto-approve threshold must be between 0 and 1.');
      return;
    }

    const parsedShare = Number(creatorRevenueShare);
    if (!Number.isFinite(parsedShare) || parsedShare < 0 || parsedShare > 100) {
      setCreatorError('Revenue share must be between 0 and 100.');
      return;
    }

    try {
      await triggerSaveCreatorGovernance(
        {
          studioId: creatorStudioId,
          governance: {
            autoApproveThreshold: Number(parsedThreshold.toFixed(3)),
            majorPrRequiresHuman: creatorMajorPrRequiresHuman,
            allowForks: creatorAllowForks,
            moderationMode: creatorModerationMode,
          },
          revenueSharePercent: Number(parsedShare.toFixed(2)),
        },
        { throwOnError: true },
      );

      setCreatorStep(3);
      setCreatorSaved('Governance saved.');
    } catch (error: unknown) {
      setCreatorError(
        getApiErrorMessage(error, 'Failed to save governance settings.'),
      );
    }
  };

  const activateCreatorToolkit = async () => {
    setCreatorError(null);
    setCreatorSaved(null);
    if (!creatorStudioId) {
      setCreatorError('Creator studio ID is missing.');
      return;
    }

    try {
      await triggerActivateCreatorStudio(
        {
          studioId: creatorStudioId,
          providerAccountId: creatorBillingAccountId.trim() || undefined,
        },
        { throwOnError: true },
      );

      setCreatorStep(4);
      setCreatorSaved('Creator toolkit is active.');
      const summary = await triggerLoadCreatorFunnel(
        { windowDays: 30 },
        { throwOnError: true },
      );
      setCreatorFunnel(summary);
    } catch (error: unknown) {
      setCreatorError(
        getApiErrorMessage(error, 'Failed to activate creator toolkit.'),
      );
    }
  };

  const pingCreatorRetention = async () => {
    setCreatorError(null);
    setCreatorSaved(null);
    if (!creatorStudioId) {
      setCreatorError('Creator studio ID is missing.');
      return;
    }

    try {
      await triggerCreatorRetention(
        { studioId: creatorStudioId },
        { throwOnError: true },
      );

      const summary = await triggerLoadCreatorFunnel(
        { windowDays: 30 },
        { throwOnError: true },
      );
      setCreatorFunnel(summary);
      setCreatorSaved('Retention ping recorded.');
    } catch (error: unknown) {
      setCreatorError(
        getApiErrorMessage(error, 'Failed to record retention ping.'),
      );
    }
  };

  return (
    <main className="grid gap-4 sm:gap-5">
      <div className="card p-4 sm:p-5">
        <p className="pill">{t('studioOnboarding.header.pill')}</p>
        <h1 className="mt-3 font-semibold text-foreground text-xl sm:text-2xl">
          {t('studioOnboarding.header.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('studioOnboarding.header.subtitle')}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-sm sm:p-3.5">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-chart-2/30 bg-chart-2/12 p-2.5 text-chart-2 text-sm sm:p-3.5">
          {t('studioOnboarding.status.saved')}
        </div>
      )}

      {step === 1 && (
        <section className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4">
          <h2 className="font-semibold text-foreground text-sm">
            {t('studioOnboarding.steps.connectAgent')}
          </h2>
          <label className="grid gap-2 font-medium text-foreground text-sm">
            {t('studioOnboarding.fields.agentId')}
            <input
              className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
              onChange={(event) => setAgentId(event.target.value)}
              placeholder={t('studioOnboarding.fields.agentIdPlaceholder')}
              value={agentId}
            />
          </label>
          <label className="grid gap-2 font-medium text-foreground text-sm">
            {t('studioOnboarding.fields.agentApiKey')}
            <input
              className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={t('studioOnboarding.fields.agentApiKey')}
              type="password"
              value={apiKey}
            />
          </label>
          <button
            className={`rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 sm:py-2 ${focusRingClass}`}
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
        <section className="grid gap-4 sm:gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4">
            <h2 className="font-semibold text-foreground text-sm">
              {t('studioOnboarding.steps.studioProfile')}
            </h2>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('studioOnboarding.fields.studioName')}
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
                onChange={(event) => setStudioName(event.target.value)}
                placeholder={t('studioOnboarding.fields.studioNamePlaceholder')}
                value={studioName}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('studioOnboarding.fields.avatarUrl')}
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder={t('studioOnboarding.fields.avatarUrlPlaceholder')}
                value={avatarUrl}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              {t('studioOnboarding.fields.styleTags')}
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
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
                  className={`rounded-full border border-transparent bg-background/56 px-3 py-1 text-foreground text-xs transition hover:bg-background/74 ${focusRingClass}`}
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
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
                onChange={(event) => setPersonality(event.target.value)}
                placeholder={t(
                  'studioOnboarding.fields.personalityPlaceholder',
                )}
                rows={3}
                value={personality}
              />
            </label>
            <section className="grid gap-2.5 rounded-xl border border-border/25 bg-background/50 p-3 sm:p-3.5">
              <h3 className="font-semibold text-foreground text-sm">
                Role personas (optional)
              </h3>
              <p className="text-muted-foreground text-xs">
                Define distinct voice for each role. Used by AI runtime and
                public pages.
              </p>
              <div className="grid gap-2.5 md:grid-cols-2">
                {PERSONA_ROLES.map((role) => (
                  <div
                    className="grid gap-1.5 rounded-lg border border-border/20 bg-background/65 p-2.5"
                    key={role}
                  >
                    <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
                      {PERSONA_ROLE_LABELS[role]}
                    </p>
                    <label className="grid gap-1 text-muted-foreground text-xs">
                      Tone
                      <input
                        aria-label={`${PERSONA_ROLE_LABELS[role]} tone`}
                        className={`rounded-lg border border-border/25 bg-background/70 px-2.5 py-1.5 text-foreground text-xs placeholder:text-muted-foreground/70 ${focusRingClass}`}
                        onChange={(event) =>
                          updateRolePersonaField(
                            role,
                            'tone',
                            event.target.value,
                          )
                        }
                        placeholder="e.g. ruthless but fair"
                        value={rolePersonas[role].tone}
                      />
                    </label>
                    <label className="grid gap-1 text-muted-foreground text-xs">
                      Signature phrase
                      <input
                        aria-label={`${PERSONA_ROLE_LABELS[role]} signature`}
                        className={`rounded-lg border border-border/25 bg-background/70 px-2.5 py-1.5 text-foreground text-xs placeholder:text-muted-foreground/70 ${focusRingClass}`}
                        onChange={(event) =>
                          updateRolePersonaField(
                            role,
                            'signaturePhrase',
                            event.target.value,
                          )
                        }
                        placeholder="e.g. Ship the arc."
                        value={rolePersonas[role].signaturePhrase}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>
            <div className="flex flex-wrap gap-3">
              <button
                className={`rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 sm:py-2 ${focusRingClass}`}
                disabled={loading}
                onClick={saveProfile}
                type="button"
              >
                {loading
                  ? t('studioOnboarding.actions.saving')
                  : t('studioOnboarding.actions.saveProfile')}
              </button>
              <button
                className={`rounded-full border border-transparent bg-background/58 px-5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
                onClick={() => setStep(3)}
                type="button"
              >
                {t('studioOnboarding.actions.skipOptionalSteps')}
              </button>
            </div>
          </div>
          <div className="card grid gap-3 p-4 text-muted-foreground text-sm sm:p-5">
            <h2 className="font-semibold text-foreground text-sm">
              {t('studioOnboarding.budgets.title')}
            </h2>
            <div className="rounded-xl border border-border/25 bg-background/60 p-2.5 text-xs sm:p-3">
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
            <div className="rounded-xl border border-border/25 bg-background/60 p-2.5 text-xs sm:p-3">
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
        <section className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4">
          <h2 className="font-semibold text-foreground text-sm">
            {t('studioOnboarding.steps.firstActionsChecklist')}
          </h2>
          <ul className="grid gap-2 text-muted-foreground text-sm">
            {CHECKLIST.map((item) => (
              <li
                className="rounded-xl border border-border/25 bg-background/60 p-2.5 sm:p-3"
                key={item}
              >
                {item}
              </li>
            ))}
          </ul>
          <button
            className={`rounded-full border border-transparent bg-background/58 px-5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
            onClick={() => setStep(1)}
            type="button"
          >
            {t('studioOnboarding.actions.editProfile')}
          </button>
        </section>
      )}

      <section className="card grid gap-3 p-3 sm:gap-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground text-sm">
            Creator toolkit onboarding
          </h2>
          <p className="pill">Step {creatorStep}/4</p>
        </div>
        <p className="text-muted-foreground text-sm">
          Human -{'>'} Agent Studio flow: profile, governance, billing, and
          retention tracking.
        </p>

        {creatorError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-destructive text-sm sm:p-3.5">
            {creatorError}
          </div>
        ) : null}
        {creatorSaved ? (
          <div className="rounded-xl border border-chart-2/30 bg-chart-2/12 p-2.5 text-chart-2 text-sm sm:p-3.5">
            {creatorSaved}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <span className={creatorStep >= 1 ? 'pill-primary' : 'pill'}>
            Profile
          </span>
          <span className={creatorStep >= 2 ? 'pill-primary' : 'pill'}>
            Governance
          </span>
          <span className={creatorStep >= 3 ? 'pill-primary' : 'pill'}>
            Billing
          </span>
          <span className={creatorStep >= 4 ? 'pill-primary' : 'pill'}>
            Ready
          </span>
        </div>

        {creatorStep === 1 ? (
          <div className="grid gap-3">
            <label className="grid gap-2 font-medium text-foreground text-sm">
              Creator studio name *
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
                onChange={(event) => setCreatorStudioName(event.target.value)}
                placeholder="Prompt Forge"
                value={creatorStudioName}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              Tagline
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
                onChange={(event) => setCreatorTagline(event.target.value)}
                placeholder="Human-led cinematic prompt systems"
                value={creatorTagline}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              Style preset
              <select
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground sm:px-4 ${focusRingClass}`}
                onChange={(event) =>
                  setCreatorStylePreset(
                    event.target.value as CreatorStylePreset,
                  )
                }
                value={creatorStylePreset}
              >
                <option value="balanced">Balanced</option>
                <option value="bold">Bold</option>
                <option value="minimal">Minimal</option>
                <option value="experimental">Experimental</option>
              </select>
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              Revenue share (%)
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground sm:px-4 ${focusRingClass}`}
                max={100}
                min={0}
                onChange={(event) => setCreatorRevenueShare(event.target.value)}
                step="0.5"
                type="number"
                value={creatorRevenueShare}
              />
            </label>
            <button
              className={`rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 sm:py-2 ${focusRingClass}`}
              disabled={creatorLoading}
              onClick={createCreatorProfile}
              type="button"
            >
              {creatorLoading ? 'Creating...' : 'Create creator studio'}
            </button>
          </div>
        ) : null}

        {creatorStep === 2 ? (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-xs">
              Studio ID: {creatorStudioId || 'not created yet'}
            </p>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              Auto-approve threshold (0..1)
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground sm:px-4 ${focusRingClass}`}
                max={1}
                min={0}
                onChange={(event) => setCreatorThreshold(event.target.value)}
                step="0.05"
                type="number"
                value={creatorThreshold}
              />
            </label>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              Moderation mode
              <select
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground sm:px-4 ${focusRingClass}`}
                onChange={(event) =>
                  setCreatorModerationMode(
                    event.target.value as CreatorModerationMode,
                  )
                }
                value={creatorModerationMode}
              >
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="open">Open</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-foreground text-sm">
              <input
                checked={creatorMajorPrRequiresHuman}
                className={focusRingClass}
                onChange={(event) =>
                  setCreatorMajorPrRequiresHuman(event.target.checked)
                }
                type="checkbox"
              />
              Major PR requires human review
            </label>
            <label className="flex items-center gap-2 text-foreground text-sm">
              <input
                checked={creatorAllowForks}
                className={focusRingClass}
                onChange={(event) => setCreatorAllowForks(event.target.checked)}
                type="checkbox"
              />
              Allow forks
            </label>
            <button
              className={`rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 sm:py-2 ${focusRingClass}`}
              disabled={creatorLoading}
              onClick={saveCreatorGovernance}
              type="button"
            >
              {creatorLoading ? 'Saving...' : 'Save governance'}
            </button>
          </div>
        ) : null}

        {creatorStep === 3 ? (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-xs">
              Connect billing to activate revenue-sharing and onboarding
              funnels.
            </p>
            <label className="grid gap-2 font-medium text-foreground text-sm">
              Billing provider account ID (optional)
              <input
                className={`rounded-xl border border-border/25 bg-background/70 px-3 py-2 text-foreground placeholder:text-muted-foreground/70 sm:px-4 ${focusRingClass}`}
                onChange={(event) =>
                  setCreatorBillingAccountId(event.target.value)
                }
                placeholder="acct_1234..."
                value={creatorBillingAccountId}
              />
            </label>
            <button
              className={`rounded-full bg-primary px-5 py-1.5 font-semibold text-primary-foreground text-xs transition hover:bg-primary/90 sm:py-2 ${focusRingClass}`}
              disabled={creatorLoading}
              onClick={activateCreatorToolkit}
              type="button"
            >
              {creatorLoading ? 'Activating...' : 'Activate creator toolkit'}
            </button>
          </div>
        ) : null}

        {creatorStep >= 4 ? (
          <div className="grid gap-3">
            <p className="rounded-xl border border-chart-2/30 bg-chart-2/12 p-2.5 text-chart-2 text-sm sm:p-3.5">
              Creator toolkit active.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-full border border-transparent bg-background/58 px-5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
                disabled={creatorLoading}
                onClick={pingCreatorRetention}
                type="button"
              >
                {creatorLoading ? 'Syncing...' : 'Retention ping'}
              </button>
              <button
                className={`rounded-full border border-transparent bg-background/58 px-5 py-1.5 font-semibold text-foreground text-xs transition hover:bg-background/74 sm:py-2 ${focusRingClass}`}
                disabled={creatorLoading}
                onClick={async () => {
                  setCreatorError(null);
                  try {
                    const summary = await triggerLoadCreatorFunnel(
                      { windowDays: 30 },
                      { throwOnError: true },
                    );
                    setCreatorFunnel(summary);
                  } catch (error: unknown) {
                    setCreatorError(
                      getApiErrorMessage(
                        error,
                        'Failed to load funnel summary.',
                      ),
                    );
                  }
                }}
                type="button"
              >
                Refresh funnel
              </button>
            </div>

            {creatorFunnel ? (
              <div className="grid gap-2 rounded-xl border border-border/25 bg-background/60 p-2.5 text-xs sm:p-3">
                <p className="font-semibold text-foreground">Funnel (30d)</p>
                <p className="text-muted-foreground">
                  Created: {creatorFunnel.created} | Governance:{' '}
                  {creatorFunnel.governanceConfigured} | Billing:{' '}
                  {creatorFunnel.billingConnected} | Activated:{' '}
                  {creatorFunnel.activated}
                </p>
                <p className="text-muted-foreground">
                  Retention pings: {creatorFunnel.retentionPing} | Activation
                  rate: {creatorFunnel.activationRatePercent.toFixed(2)}%
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
