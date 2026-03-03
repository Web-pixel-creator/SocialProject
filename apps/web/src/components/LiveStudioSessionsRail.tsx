'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useLanguage } from '../contexts/LanguageContext';
import { apiClient } from '../lib/api';
import {
  connectOpenAIRealtimeConnection,
  type OpenAIRealtimeConnection,
} from '../lib/openaiRealtimeWebRtc';
import { handleRealtimeToolCallsFromResponseDone } from '../lib/realtimeToolBridge';

type LiveSessionStatus = 'forming' | 'live' | 'completed' | 'cancelled';

interface LiveSessionSummary {
  id: string;
  title: string;
  objective: string;
  status: LiveSessionStatus;
  participantCount: number;
  messageCount: number;
  lastActivityAt: string | Date;
  overlay: LiveSessionOverlay;
}

interface LiveSessionOverlay {
  humanCount: number;
  agentCount: number;
  latestMessage: string | null;
  mergeSignalPct: number;
  rejectSignalPct: number;
  recapSummary: string | null;
  recapClipUrl: string | null;
}

type RealtimeCopilotStatus =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'ready'
  | 'error';

interface RealtimeCopilotBootstrap {
  provider: string;
  sessionId: string;
  clientSecret: string;
  clientSecretExpiresAt?: string | null;
  expiresAt?: string | null;
  model?: string;
  voice?: string;
  transportHints?: {
    recommended?: string;
    websocketSupported?: boolean;
    pushToTalk?: boolean;
  };
  outputModalities?: Array<'text' | 'audio'>;
}

interface RealtimeCopilotState {
  status: RealtimeCopilotStatus;
  bootstrap?: RealtimeCopilotBootstrap;
  error?: string;
  pushToTalkEnabled?: boolean;
}

interface RealtimeToolBridgeState {
  processedCount: number;
  lastProcessedAt: string | null;
  error: string | null;
}

interface RealtimeVoiceControlState {
  isHolding: boolean;
  interruptions: number;
  lastCommitAt: string | null;
  error: string | null;
}

interface RealtimeTranscriptState {
  liveText: string;
  finalText: string | null;
  lastEventAt: string | null;
  persistedAt: string | null;
  persistError: string | null;
}

type RealtimeVoiceRuntimeStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking';

interface RealtimeVoiceRuntimeState {
  status: RealtimeVoiceRuntimeStatus;
  lastEventAt: string | null;
}

interface LiveSessionRealtimeServerEventDetail {
  liveSessionId: string;
  serverEvent: unknown;
}

interface LiveSessionRealtimeClientEventDetail {
  liveSessionId: string;
  clientEvent: Record<string, unknown>;
}

type LiveSessionRealtimeSendToRole = 'author' | 'critic' | 'maker' | 'judge';

interface LiveSessionRealtimeGatewaySendPayload {
  toRole: LiveSessionRealtimeSendToRole;
  type: string;
  payload: Record<string, unknown>;
}

type Translate = (key: string) => string;

interface LiveStudioSessionsRailProps {
  onSessionCountChange?: (count: number) => void;
}

export const LIVE_SESSION_REALTIME_SERVER_EVENT =
  'finishit:live-session-realtime-server-event';
export const LIVE_SESSION_REALTIME_CLIENT_EVENT =
  'finishit:live-session-realtime-client-event';

const getEmptyRealtimeToolBridgeState = (): RealtimeToolBridgeState => ({
  processedCount: 0,
  lastProcessedAt: null,
  error: null,
});

const getEmptyRealtimeVoiceControlState = (): RealtimeVoiceControlState => ({
  isHolding: false,
  interruptions: 0,
  lastCommitAt: null,
  error: null,
});

const getEmptyRealtimeTranscriptState = (): RealtimeTranscriptState => ({
  liveText: '',
  finalText: null,
  lastEventAt: null,
  persistedAt: null,
  persistError: null,
});

const getEmptyRealtimeVoiceRuntimeState = (): RealtimeVoiceRuntimeState => ({
  status: 'idle',
  lastEventAt: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const MAX_TRANSCRIPT_LENGTH = 500;
const TRANSCRIPT_MESSAGE_PREFIX = '[Voice recap] ';
const MAX_TRANSCRIPT_MESSAGE_CONTENT_LENGTH = 500;
const TRANSCRIPT_PERSIST_COOLDOWN_MS = 12_000;
const TRANSCRIPT_TRUNCATION_SUFFIX = '...';

const trimTranscript = (value: string): string => {
  if (value.length <= MAX_TRANSCRIPT_LENGTH) {
    return value;
  }
  return value.slice(value.length - MAX_TRANSCRIPT_LENGTH);
};

const readTranscriptString = (
  source: Record<string, unknown>,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
};

const extractTranscriptFromResponseOutput = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }
  const nestedResponse = isRecord(value.response) ? value.response : null;
  const output = Array.isArray(nestedResponse?.output)
    ? nestedResponse.output
    : [];
  if (output.length < 1) {
    return null;
  }
  const segments: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }
    const directText = readTranscriptString(item, ['text', 'transcript']);
    if (directText) {
      segments.push(directText);
    }
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!isRecord(part)) {
        continue;
      }
      const partText = readTranscriptString(part, [
        'text',
        'transcript',
        'delta',
      ]);
      if (partText) {
        segments.push(partText);
      }
    }
  }
  if (segments.length < 1) {
    return null;
  }
  return segments.join(' ').trim();
};

const extractRealtimeTranscriptUpdate = (
  serverEvent: unknown,
): { kind: 'delta' | 'done'; text: string } | null => {
  if (!isRecord(serverEvent)) {
    return null;
  }
  const eventType = serverEvent.type;
  if (typeof eventType !== 'string' || eventType.length < 1) {
    return null;
  }

  if (
    eventType === 'response.output_audio_transcript.delta' ||
    eventType === 'response.output_text.delta'
  ) {
    const delta = readTranscriptString(serverEvent, ['delta']);
    if (!delta) {
      return null;
    }
    return {
      kind: 'delta',
      text: delta,
    };
  }

  if (
    eventType === 'response.output_audio_transcript.done' ||
    eventType === 'response.output_text.done'
  ) {
    const doneText = readTranscriptString(serverEvent, [
      'transcript',
      'text',
      'delta',
    ]);
    if (!doneText) {
      return null;
    }
    return {
      kind: 'done',
      text: doneText,
    };
  }

  if (eventType === 'response.done') {
    const doneText = extractTranscriptFromResponseOutput(serverEvent);
    if (!doneText) {
      return null;
    }
    return {
      kind: 'done',
      text: doneText,
    };
  }

  return null;
};

const extractVoiceRuntimeStatusUpdate = (
  serverEvent: unknown,
): RealtimeVoiceRuntimeStatus | null => {
  if (!isRecord(serverEvent)) {
    return null;
  }
  const eventType = serverEvent.type;
  if (typeof eventType !== 'string' || eventType.length < 1) {
    return null;
  }

  if (eventType === 'input_audio_buffer.speech_started') {
    return 'listening';
  }
  if (
    eventType === 'input_audio_buffer.speech_stopped' ||
    eventType === 'input_audio_buffer.committed' ||
    eventType === 'response.created'
  ) {
    return 'thinking';
  }
  if (eventType === 'response.output_audio.delta') {
    return 'speaking';
  }
  if (
    eventType === 'response.output_audio.done' ||
    eventType === 'response.done' ||
    eventType === 'response.cancelled' ||
    eventType === 'error'
  ) {
    return 'idle';
  }

  return null;
};

const toRealtimeStatusLabel = (
  status: RealtimeVoiceRuntimeStatus,
  t: Translate,
): string => {
  if (status === 'listening') {
    return t('liveSessionsRail.voice.status.listening');
  }
  if (status === 'thinking') {
    return t('liveSessionsRail.voice.status.thinking');
  }
  if (status === 'speaking') {
    return t('liveSessionsRail.voice.status.speaking');
  }
  return t('liveSessionsRail.voice.status.idle');
};

const getRealtimeStatusClassName = (status: RealtimeVoiceRuntimeStatus) => {
  if (status === 'listening') {
    return 'border border-chart-2/60 bg-chart-2/20 text-chart-2';
  }
  if (status === 'thinking') {
    return 'border border-primary/55 bg-primary/18 text-primary';
  }
  if (status === 'speaking') {
    return 'border border-chart-3/55 bg-chart-3/18 text-chart-3';
  }
  return 'border border-border/45 bg-background/78 text-foreground/80';
};

const isLiveSessionRealtimeServerEventDetail = (
  value: unknown,
): value is LiveSessionRealtimeServerEventDetail => {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.liveSessionId !== 'string' ||
    value.liveSessionId.length < 1
  ) {
    return false;
  }
  return 'serverEvent' in value;
};

const isLiveSessionRealtimeClientEventDetail = (
  value: unknown,
): value is LiveSessionRealtimeClientEventDetail => {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.liveSessionId !== 'string' ||
    value.liveSessionId.length < 1
  ) {
    return false;
  }
  if (!isRecord(value.clientEvent)) {
    return false;
  }
  return true;
};

const parseFunctionCallOutputPayload = (
  clientEvent: Record<string, unknown>,
): LiveSessionRealtimeGatewaySendPayload | null => {
  if (clientEvent.type !== 'conversation.item.create') {
    return null;
  }
  const item = isRecord(clientEvent.item) ? clientEvent.item : null;
  if (!item || item.type !== 'function_call_output') {
    return null;
  }
  const callId =
    typeof item.call_id === 'string' && item.call_id.trim().length > 0
      ? item.call_id.trim()
      : null;
  const outputRaw =
    typeof item.output === 'string' && item.output.trim().length > 0
      ? item.output
      : null;
  const outputRecord = (() => {
    if (!outputRaw) {
      return null;
    }
    try {
      const parsed = JSON.parse(outputRaw) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  })();

  return {
    toRole: 'author',
    type: 'observer_function_call_output',
    payload: {
      callId,
      hasError: Boolean(
        outputRecord &&
        typeof outputRecord.error === 'string' &&
        outputRecord.error.trim().length > 0,
      ),
      errorCode:
        outputRecord && typeof outputRecord.error === 'string'
          ? outputRecord.error
          : null,
    },
  };
};

const mapRealtimeClientEventToGatewaySendPayload = (
  clientEvent: Record<string, unknown>,
): LiveSessionRealtimeGatewaySendPayload | null => {
  const functionCallOutput = parseFunctionCallOutputPayload(clientEvent);
  if (functionCallOutput) {
    return functionCallOutput;
  }

  if (clientEvent.type === 'response.create') {
    return {
      toRole: 'author',
      type: 'observer_response_create',
      payload: {
        source: 'tool_bridge',
      },
    };
  }

  return null;
};

export const emitLiveSessionRealtimeServerEvent = (
  detail: LiveSessionRealtimeServerEventDetail,
) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<LiveSessionRealtimeServerEventDetail>(
      LIVE_SESSION_REALTIME_SERVER_EVENT,
      {
        detail,
      },
    ),
  );
};

const buildFallbackSessions = (t: Translate): LiveSessionSummary[] => [
  {
    id: 'fallback-live-1',
    title: t('liveSessionsRail.fallback.live1.title'),
    objective: t('liveSessionsRail.fallback.live1.objective'),
    status: 'live',
    participantCount: 18,
    messageCount: 24,
    lastActivityAt: new Date().toISOString(),
    overlay: {
      humanCount: 12,
      agentCount: 6,
      latestMessage: t('liveSessionsRail.fallback.live1.latestMessage'),
      mergeSignalPct: 67,
      rejectSignalPct: 33,
      recapSummary: null,
      recapClipUrl: null,
    },
  },
  {
    id: 'fallback-live-2',
    title: t('liveSessionsRail.fallback.live2.title'),
    objective: t('liveSessionsRail.fallback.live2.objective'),
    status: 'forming',
    participantCount: 6,
    messageCount: 5,
    lastActivityAt: new Date().toISOString(),
    overlay: {
      humanCount: 4,
      agentCount: 2,
      latestMessage: t('liveSessionsRail.fallback.live2.latestMessage'),
      mergeSignalPct: 0,
      rejectSignalPct: 0,
      recapSummary: null,
      recapClipUrl: null,
    },
  },
];

const statusClassByValue: Record<LiveSessionStatus, string> = {
  forming: 'border border-border/50 bg-muted/55 text-foreground/80',
  live: 'border border-chart-2/60 bg-chart-2/20 text-chart-2',
  completed: 'border border-primary/55 bg-primary/18 text-primary',
  cancelled: 'border border-destructive/60 bg-destructive/20 text-destructive',
};

const toLiveSessionStatusLabel = (
  status: LiveSessionStatus,
  t: Translate,
): string => {
  if (status === 'forming') {
    return t('liveSessionsRail.status.forming');
  }
  if (status === 'live') {
    return t('liveSessionsRail.status.live');
  }
  if (status === 'completed') {
    return t('liveSessionsRail.status.completed');
  }
  return t('liveSessionsRail.status.cancelled');
};

const formatRelativeMinutes = (value: string | Date, t: Translate): string => {
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return t('changeCard.labels.justNow');
  }
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  if (minutes < 1) {
    return t('changeCard.labels.justNow');
  }
  if (minutes < 60) {
    return `${minutes}${t('time.minuteAgoSuffix')}`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}${t('time.hourAgoSuffix')}`;
};

const resolveRealtimeBootstrapError = (
  error: unknown,
): { key: string; message?: string } => {
  const fallbackKey = 'liveSessionsRail.errors.bootstrapFailed';
  if (!error || typeof error !== 'object') {
    return { key: fallbackKey };
  }
  const maybeResponse = (
    error as {
      response?: {
        status?: number;
        data?: { error?: string; message?: string };
      };
      message?: string;
    }
  ).response;
  const status = maybeResponse?.status;
  const responseError = maybeResponse?.data?.error;
  const responseMessage = maybeResponse?.data?.message;

  if (status === 401 || status === 403) {
    return { key: 'liveSessionsRail.errors.authRequired' };
  }
  if (status === 429) {
    return { key: 'liveSessionsRail.errors.rateLimited' };
  }
  if (responseError === 'OPENAI_REALTIME_NOT_CONFIGURED') {
    return { key: 'liveSessionsRail.errors.notConfigured' };
  }
  const errorMessage = (error as { message?: string }).message;
  if (errorMessage === 'LIVE_SESSION_REALTIME_BOOTSTRAP_INCOMPLETE') {
    return { key: 'liveSessionsRail.errors.bootstrapPayloadIncomplete' };
  }
  if (responseMessage && responseMessage.trim().length > 0) {
    return { key: fallbackKey, message: responseMessage };
  }
  const genericMessage = errorMessage?.trim() ?? '';
  if (genericMessage.length > 0) {
    return { key: fallbackKey, message: genericMessage };
  }
  return { key: fallbackKey };
};

const fetchLiveSessions = async (): Promise<LiveSessionSummary[]> => {
  const response = await apiClient.get('/live-sessions', {
    params: {
      limit: 4,
    },
  });
  if (!Array.isArray(response.data)) {
    return [];
  }

  const sessions = response.data.map((item: Record<string, unknown>) => ({
    id: String(item.id ?? ''),
    title: String(item.title ?? 'Untitled live session'),
    objective: String(item.objective ?? 'No objective yet'),
    status: (item.status as LiveSessionStatus) ?? 'forming',
    participantCount: Number(item.participantCount ?? 0),
    messageCount: Number(item.messageCount ?? 0),
    lastActivityAt: String(item.lastActivityAt ?? new Date().toISOString()),
    overlay: {
      humanCount: 0,
      agentCount: 0,
      latestMessage: null,
      mergeSignalPct: 0,
      rejectSignalPct: 0,
      recapSummary: null,
      recapClipUrl: null,
    },
  }));

  const sessionsWithOverlay = await Promise.all(
    sessions.map(async (session) => {
      try {
        const detail = await apiClient.get(`/live-sessions/${session.id}`);
        const presence = Array.isArray(detail.data?.presence)
          ? (detail.data.presence as Record<string, unknown>[])
          : [];
        const messages = Array.isArray(detail.data?.messages)
          ? (detail.data.messages as Record<string, unknown>[])
          : [];

        const humanCount = presence.filter(
          (item) =>
            String(item.participantType ?? item.participant_type) === 'human',
        ).length;
        const agentCount = presence.filter(
          (item) =>
            String(item.participantType ?? item.participant_type) === 'agent',
        ).length;
        const latestMessage =
          messages.length > 0 ? String(messages[0]?.content ?? '') : null;
        const detailSession =
          detail.data && typeof detail.data === 'object'
            ? (detail.data.session as Record<string, unknown> | undefined)
            : undefined;

        let recapSummary: string | null = null;
        if (detailSession) {
          if (typeof detailSession.recapSummary === 'string') {
            recapSummary = detailSession.recapSummary;
          } else if (typeof detailSession.recap_summary === 'string') {
            recapSummary = detailSession.recap_summary;
          }
        }

        let recapClipUrl: string | null = null;
        if (detailSession) {
          if (typeof detailSession.recapClipUrl === 'string') {
            recapClipUrl = detailSession.recapClipUrl;
          } else if (typeof detailSession.recap_clip_url === 'string') {
            recapClipUrl = detailSession.recap_clip_url;
          }
        }

        let mergeSignalCount = 0;
        let rejectSignalCount = 0;
        for (const message of messages.slice(0, 20)) {
          const content = String(message.content ?? '').toLowerCase();
          if (
            content.includes('merge') ||
            content.includes('approve') ||
            content.includes('ship')
          ) {
            mergeSignalCount += 1;
          }
          if (
            content.includes('reject') ||
            content.includes('decline') ||
            content.includes('block')
          ) {
            rejectSignalCount += 1;
          }
        }

        const totalSignals = mergeSignalCount + rejectSignalCount;
        const mergeSignalPct =
          totalSignals > 0
            ? Math.round((mergeSignalCount / totalSignals) * 100)
            : 0;
        const rejectSignalPct =
          totalSignals > 0
            ? Math.round((rejectSignalCount / totalSignals) * 100)
            : 0;

        return {
          ...session,
          overlay: {
            humanCount,
            agentCount,
            latestMessage,
            mergeSignalPct,
            rejectSignalPct,
            recapSummary,
            recapClipUrl,
          },
        };
      } catch {
        return session;
      }
    }),
  );

  return sessionsWithOverlay;
};

export const LiveStudioSessionsRail = ({
  onSessionCountChange,
}: LiveStudioSessionsRailProps = {}) => {
  const { t } = useLanguage();
  const fallbackSessions = useMemo(() => buildFallbackSessions(t), [t]);
  const [copilotStateBySession, setCopilotStateBySession] = useState<
    Record<string, RealtimeCopilotState>
  >({});
  const [toolBridgeStateBySession, setToolBridgeStateBySession] = useState<
    Record<string, RealtimeToolBridgeState>
  >({});
  const [voiceControlStateBySession, setVoiceControlStateBySession] = useState<
    Record<string, RealtimeVoiceControlState>
  >({});
  const [transcriptStateBySession, setTranscriptStateBySession] = useState<
    Record<string, RealtimeTranscriptState>
  >({});
  const [voiceRuntimeStateBySession, setVoiceRuntimeStateBySession] = useState<
    Record<string, RealtimeVoiceRuntimeState>
  >({});
  const [voiceFocusSessionId, setVoiceFocusSessionId] = useState<string | null>(
    null,
  );
  const copilotStateBySessionRef = useRef<Record<string, RealtimeCopilotState>>(
    {},
  );
  const realtimeConnectionsRef = useRef<
    Record<string, OpenAIRealtimeConnection>
  >({});
  const processedToolCallIdsBySessionRef = useRef<Record<string, Set<string>>>(
    {},
  );
  const transcriptPersistenceRef = useRef<
    Record<
      string,
      {
        lastText: string;
        lastPersistedAt: string | null;
        pending: boolean;
      }
    >
  >({});
  useEffect(() => {
    copilotStateBySessionRef.current = copilotStateBySession;
  }, [copilotStateBySession]);

  useEffect(() => {
    const persistTranscriptMessage = async (
      sessionId: string,
      transcript: string,
    ) => {
      const normalized = transcript.replace(/\s+/g, ' ').trim();
      if (normalized.length < 3) {
        return;
      }
      const hasAuthHeader =
        typeof apiClient.defaults?.headers?.common?.Authorization ===
        'string' &&
        apiClient.defaults.headers.common.Authorization.trim().length > 0;
      if (!hasAuthHeader) {
        return;
      }

      const entry = transcriptPersistenceRef.current[sessionId] ?? {
        lastText: '',
        lastPersistedAt: null,
        pending: false,
      };
      if (entry.pending || entry.lastText === normalized) {
        return;
      }

      if (entry.lastPersistedAt) {
        const elapsedMs =
          Date.now() - new Date(entry.lastPersistedAt).getTime();
        if (
          Number.isFinite(elapsedMs) &&
          elapsedMs >= 0 &&
          elapsedMs < TRANSCRIPT_PERSIST_COOLDOWN_MS
        ) {
          return;
        }
      }

      entry.pending = true;
      transcriptPersistenceRef.current[sessionId] = entry;

      const prefixed = `${TRANSCRIPT_MESSAGE_PREFIX}${normalized}`;
      const content =
        prefixed.length > MAX_TRANSCRIPT_MESSAGE_CONTENT_LENGTH
          ? `${prefixed.slice(
            0,
            MAX_TRANSCRIPT_MESSAGE_CONTENT_LENGTH -
            TRANSCRIPT_TRUNCATION_SUFFIX.length,
          )}${TRANSCRIPT_TRUNCATION_SUFFIX}`
          : prefixed;

      try {
        await apiClient.post(`/live-sessions/${sessionId}/messages/observer`, {
          content,
        });
        const persistedAt = new Date().toISOString();
        transcriptPersistenceRef.current[sessionId] = {
          lastText: normalized,
          lastPersistedAt: persistedAt,
          pending: false,
        };
        setTranscriptStateBySession((current) => ({
          ...current,
          [sessionId]: {
            ...(current[sessionId] ?? getEmptyRealtimeTranscriptState()),
            persistedAt,
            persistError: null,
          },
        }));
      } catch (error) {
        transcriptPersistenceRef.current[sessionId] = {
          ...entry,
          pending: false,
        };
        const message =
          error instanceof Error
            ? error.message
            : t('liveSessionsRail.errors.persistTranscript');
        setTranscriptStateBySession((current) => ({
          ...current,
          [sessionId]: {
            ...(current[sessionId] ?? getEmptyRealtimeTranscriptState()),
            persistError: message,
          },
        }));
      }
    };

    const handleServerEvent = async (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      const detail = customEvent.detail;
      if (!isLiveSessionRealtimeServerEventDetail(detail)) {
        return;
      }

      const sessionState =
        copilotStateBySessionRef.current[detail.liveSessionId] ?? null;
      if (sessionState?.status !== 'ready') {
        return;
      }

      const runtimeStatus = extractVoiceRuntimeStatusUpdate(detail.serverEvent);
      if (runtimeStatus) {
        setVoiceRuntimeStateBySession((current) => ({
          ...current,
          [detail.liveSessionId]: {
            status: runtimeStatus,
            lastEventAt: new Date().toISOString(),
          },
        }));
        if (runtimeStatus === 'idle') {
          setVoiceControlStateBySession((current) => ({
            ...current,
            [detail.liveSessionId]: {
              ...(current[detail.liveSessionId] ??
                getEmptyRealtimeVoiceControlState()),
              isHolding: false,
            },
          }));
        }
      }

      const transcriptUpdate = extractRealtimeTranscriptUpdate(
        detail.serverEvent,
      );
      if (transcriptUpdate) {
        setTranscriptStateBySession((current) => {
          const previous =
            current[detail.liveSessionId] ?? getEmptyRealtimeTranscriptState();
          if (transcriptUpdate.kind === 'delta') {
            return {
              ...current,
              [detail.liveSessionId]: {
                liveText: trimTranscript(
                  `${previous.liveText}${transcriptUpdate.text}`,
                ),
                finalText: previous.finalText,
                lastEventAt: new Date().toISOString(),
                persistedAt: previous.persistedAt,
                persistError: previous.persistError,
              },
            };
          }
          const fallbackFinal = trimTranscript(previous.liveText);
          const finalText = trimTranscript(
            transcriptUpdate.text || fallbackFinal,
          );
          persistTranscriptMessage(detail.liveSessionId, finalText);
          return {
            ...current,
            [detail.liveSessionId]: {
              liveText: '',
              finalText,
              lastEventAt: new Date().toISOString(),
              persistedAt: previous.persistedAt,
              persistError: null,
            },
          };
        });
      }

      try {
        const processedCallIds =
          processedToolCallIdsBySessionRef.current[detail.liveSessionId] ??
          new Set<string>();
        processedToolCallIdsBySessionRef.current[detail.liveSessionId] =
          processedCallIds;
        const result = await handleRealtimeToolCallsFromResponseDone({
          liveSessionId: detail.liveSessionId,
          serverEvent: detail.serverEvent,
          processedCallIds,
          sendClientEvent: (clientEvent) => {
            window.dispatchEvent(
              new CustomEvent<LiveSessionRealtimeClientEventDetail>(
                LIVE_SESSION_REALTIME_CLIENT_EVENT,
                {
                  detail: {
                    liveSessionId: detail.liveSessionId,
                    clientEvent,
                  },
                },
              ),
            );
          },
        });

        if (result.processed > 0) {
          setToolBridgeStateBySession((current) => {
            const previous =
              current[detail.liveSessionId] ??
              getEmptyRealtimeToolBridgeState();
            return {
              ...current,
              [detail.liveSessionId]: {
                processedCount: previous.processedCount + result.processed,
                lastProcessedAt: new Date().toISOString(),
                error: null,
              },
            };
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t('liveSessionsRail.errors.toolBridgeFailed');
        setToolBridgeStateBySession((current) => ({
          ...current,
          [detail.liveSessionId]: {
            ...(current[detail.liveSessionId] ??
              getEmptyRealtimeToolBridgeState()),
            error: message,
          },
        }));
      }
    };

    window.addEventListener(
      LIVE_SESSION_REALTIME_SERVER_EVENT,
      handleServerEvent as EventListener,
    );

    return () => {
      window.removeEventListener(
        LIVE_SESSION_REALTIME_SERVER_EVENT,
        handleServerEvent as EventListener,
      );
    };
  }, [t]);

  useEffect(() => {
    const handleClientEvent = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      const detail = customEvent.detail;
      if (!isLiveSessionRealtimeClientEventDetail(detail)) {
        return;
      }
      const connection = realtimeConnectionsRef.current[detail.liveSessionId];
      if (!connection) {
        return;
      }
      connection.sendClientEvent(detail.clientEvent);
      const sendPayload = mapRealtimeClientEventToGatewaySendPayload(
        detail.clientEvent,
      );
      if (!sendPayload) {
        return;
      }
      const syncPromise = apiClient.post(
        `/live-sessions/${detail.liveSessionId}/realtime/send`,
        sendPayload,
      );
      syncPromise.catch(() => null);
    };

    window.addEventListener(
      LIVE_SESSION_REALTIME_CLIENT_EVENT,
      handleClientEvent as EventListener,
    );
    return () => {
      window.removeEventListener(
        LIVE_SESSION_REALTIME_CLIENT_EVENT,
        handleClientEvent as EventListener,
      );
    };
  }, []);

  const { data, isLoading } = useSWR<LiveSessionSummary[]>(
    'feed-live-studio-sessions',
    fetchLiveSessions,
    {
      fallbackData: fallbackSessions,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      refreshInterval: 30_000,
    },
  );

  const sessions = data ?? fallbackSessions;

  useEffect(() => {
    onSessionCountChange?.(sessions.length);
  }, [onSessionCountChange, sessions.length]);

  useEffect(() => {
    const activeSessionIds = new Set(sessions.map((session) => session.id));
    for (const [sessionId, connection] of Object.entries(
      realtimeConnectionsRef.current,
    )) {
      const session = sessions.find((item) => item.id === sessionId);
      if (
        !activeSessionIds.has(sessionId) ||
        session?.status === 'completed' ||
        session?.status === 'cancelled'
      ) {
        connection.close();
        delete realtimeConnectionsRef.current[sessionId];
        delete processedToolCallIdsBySessionRef.current[sessionId];
        delete transcriptPersistenceRef.current[sessionId];
        if (voiceFocusSessionId === sessionId) {
          setVoiceFocusSessionId(null);
        }
      }
    }
  }, [sessions, voiceFocusSessionId]);

  useEffect(
    () => () => {
      for (const connection of Object.values(realtimeConnectionsRef.current)) {
        connection.close();
      }
      realtimeConnectionsRef.current = {};
      processedToolCallIdsBySessionRef.current = {};
      transcriptPersistenceRef.current = {};
    },
    [],
  );

  useEffect(() => {
    const resolveVoiceFocusSessionId = (): string | null => {
      if (
        voiceFocusSessionId &&
        realtimeConnectionsRef.current[voiceFocusSessionId]?.pushToTalkEnabled
      ) {
        return voiceFocusSessionId;
      }

      const next = Object.entries(copilotStateBySessionRef.current).find(
        ([sessionId, sessionState]) =>
          sessionState.status === 'ready' &&
          sessionState.pushToTalkEnabled === true &&
          Boolean(realtimeConnectionsRef.current[sessionId]),
      );
      return next?.[0] ?? null;
    };

    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select'
      ) {
        return true;
      }
      return target.isContentEditable;
    };

    const startVoiceForSession = (sessionId: string) => {
      const connection = realtimeConnectionsRef.current[sessionId];
      if (!connection?.pushToTalkEnabled) {
        return;
      }
      setVoiceFocusSessionId(sessionId);
      connection.startPushToTalk();
      setVoiceControlStateBySession((current) => ({
        ...current,
        [sessionId]: {
          ...(current[sessionId] ?? getEmptyRealtimeVoiceControlState()),
          isHolding: true,
          error: null,
        },
      }));
      setVoiceRuntimeStateBySession((current) => ({
        ...current,
        [sessionId]: {
          status: 'listening',
          lastEventAt: new Date().toISOString(),
        },
      }));
    };

    const stopVoiceForSession = (sessionId: string) => {
      const connection = realtimeConnectionsRef.current[sessionId];
      if (!connection?.pushToTalkEnabled) {
        return;
      }
      connection.stopPushToTalk();
      setVoiceControlStateBySession((current) => {
        const previous =
          current[sessionId] ?? getEmptyRealtimeVoiceControlState();
        return {
          ...current,
          [sessionId]: {
            ...previous,
            isHolding: false,
            lastCommitAt: previous.isHolding
              ? new Date().toISOString()
              : previous.lastCommitAt,
            error: null,
          },
        };
      });
      setVoiceRuntimeStateBySession((current) => ({
        ...current,
        [sessionId]: {
          status: 'thinking',
          lastEventAt: new Date().toISOString(),
        },
      }));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }
      const sessionId = resolveVoiceFocusSessionId();
      if (!sessionId) {
        return;
      }
      event.preventDefault();
      startVoiceForSession(sessionId);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      const sessionId = resolveVoiceFocusSessionId();
      if (!sessionId) {
        return;
      }
      event.preventDefault();
      stopVoiceForSession(sessionId);
    };

    const handleWindowBlur = () => {
      const sessionId = resolveVoiceFocusSessionId();
      if (!sessionId) {
        return;
      }
      stopVoiceForSession(sessionId);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [voiceFocusSessionId]);

  const hasObserverToken = useMemo(() => {
    const authHeader = apiClient.defaults?.headers?.common?.Authorization;
    return typeof authHeader === 'string' && authHeader.trim().length > 0;
  }, []);

  const handleRealtimeBootstrap = async (session: LiveSessionSummary) => {
    const existingConnection = realtimeConnectionsRef.current[session.id];
    if (existingConnection) {
      existingConnection.close();
      delete realtimeConnectionsRef.current[session.id];
    }
    delete processedToolCallIdsBySessionRef.current[session.id];
    setCopilotStateBySession((current) => ({
      ...current,
      [session.id]: { status: 'loading' },
    }));
    try {
      const response = await apiClient.post(
        `/live-sessions/${session.id}/realtime/session`,
        {
          outputModalities: ['audio'],
          voice: 'marin',
          pushToTalk: true,
          topicHint: `Live objective: ${session.objective}`,
        },
      );
      const payload =
        response && typeof response.data === 'object' && response.data
          ? (response.data as RealtimeCopilotBootstrap)
          : null;
      if (!(payload?.provider && payload?.sessionId && payload?.clientSecret)) {
        throw new Error('LIVE_SESSION_REALTIME_BOOTSTRAP_INCOMPLETE');
      }
      setCopilotStateBySession((current) => ({
        ...current,
        [session.id]: {
          status: 'connecting',
          bootstrap: payload,
        },
      }));
      const connection = await connectOpenAIRealtimeConnection({
        liveSessionId: session.id,
        bootstrap: {
          provider: 'openai',
          sessionId: payload.sessionId,
          clientSecret: payload.clientSecret,
          model: payload.model,
          outputModalities: payload.outputModalities ?? ['audio'],
          pushToTalk: payload.transportHints?.pushToTalk ?? true,
        },
        onServerEvent: (serverEvent) => {
          emitLiveSessionRealtimeServerEvent({
            liveSessionId: session.id,
            serverEvent,
          });
        },
        onError: (message) => {
          setToolBridgeStateBySession((current) => ({
            ...current,
            [session.id]: {
              ...(current[session.id] ?? getEmptyRealtimeToolBridgeState()),
              error: message,
            },
          }));
          setVoiceControlStateBySession((current) => ({
            ...current,
            [session.id]: {
              ...(current[session.id] ?? getEmptyRealtimeVoiceControlState()),
              error: message,
            },
          }));
          setVoiceRuntimeStateBySession((current) => ({
            ...current,
            [session.id]: {
              status: 'idle',
              lastEventAt: new Date().toISOString(),
            },
          }));
        },
      });
      realtimeConnectionsRef.current[session.id] = connection;
      transcriptPersistenceRef.current[session.id] = {
        lastText: '',
        lastPersistedAt: null,
        pending: false,
      };
      setCopilotStateBySession((current) => ({
        ...current,
        [session.id]: {
          status: 'ready',
          bootstrap: payload,
          pushToTalkEnabled: connection.pushToTalkEnabled,
        },
      }));
      setToolBridgeStateBySession((current) => ({
        ...current,
        [session.id]: getEmptyRealtimeToolBridgeState(),
      }));
      setVoiceControlStateBySession((current) => ({
        ...current,
        [session.id]: getEmptyRealtimeVoiceControlState(),
      }));
      setTranscriptStateBySession((current) => ({
        ...current,
        [session.id]: getEmptyRealtimeTranscriptState(),
      }));
      setVoiceRuntimeStateBySession((current) => ({
        ...current,
        [session.id]: getEmptyRealtimeVoiceRuntimeState(),
      }));
      if (connection.pushToTalkEnabled) {
        setVoiceFocusSessionId(session.id);
      }
    } catch (error) {
      const resolvedError = resolveRealtimeBootstrapError(error);
      setCopilotStateBySession((current) => ({
        ...current,
        [session.id]: {
          status: 'error',
          error: resolvedError.message ?? t(resolvedError.key),
        },
      }));
    }
  };

  const handlePushToTalkStart = (sessionId: string) => {
    const connection = realtimeConnectionsRef.current[sessionId];
    if (!connection?.pushToTalkEnabled) {
      return;
    }
    setVoiceFocusSessionId(sessionId);
    connection.startPushToTalk();
    setVoiceControlStateBySession((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] ?? getEmptyRealtimeVoiceControlState()),
        isHolding: true,
        error: null,
      },
    }));
    setVoiceRuntimeStateBySession((current) => ({
      ...current,
      [sessionId]: {
        status: 'listening',
        lastEventAt: new Date().toISOString(),
      },
    }));
  };

  const handlePushToTalkStop = (sessionId: string) => {
    const connection = realtimeConnectionsRef.current[sessionId];
    if (!connection?.pushToTalkEnabled) {
      return;
    }
    connection.stopPushToTalk();
    setVoiceControlStateBySession((current) => {
      const previous =
        current[sessionId] ?? getEmptyRealtimeVoiceControlState();
      return {
        ...current,
        [sessionId]: {
          ...previous,
          isHolding: false,
          lastCommitAt: previous.isHolding
            ? new Date().toISOString()
            : previous.lastCommitAt,
          error: null,
        },
      };
    });
    setVoiceRuntimeStateBySession((current) => ({
      ...current,
      [sessionId]: {
        status: 'thinking',
        lastEventAt: new Date().toISOString(),
      },
    }));
  };

  const handlePushToTalkInterrupt = (sessionId: string) => {
    const connection = realtimeConnectionsRef.current[sessionId];
    if (!connection) {
      return;
    }
    setVoiceFocusSessionId(sessionId);
    connection.interrupt();
    setVoiceControlStateBySession((current) => {
      const previous =
        current[sessionId] ?? getEmptyRealtimeVoiceControlState();
      return {
        ...current,
        [sessionId]: {
          ...previous,
          isHolding: false,
          interruptions: previous.interruptions + 1,
          error: null,
        },
      };
    });
    setVoiceRuntimeStateBySession((current) => ({
      ...current,
      [sessionId]: {
        status: 'idle',
        lastEventAt: new Date().toISOString(),
      },
    }));
  };

  const railShellClass =
    'card !rounded-[1.5rem] border border-border/45 bg-card px-5 py-5';
  const railCountBadgeClass =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-border/55 bg-background/65 px-2 font-semibold text-sm text-foreground';
  const sessionCardClass =
    'rounded-[1.5rem] border border-border/45 bg-card/72 px-5 py-5';
  const sessionMetaPillClass =
    'inline-flex h-8 min-w-[7.5rem] items-center justify-center rounded-xl border border-border/60 bg-background/82 px-3 font-semibold text-sm text-foreground';
  const overlayCard1Class =
    'mt-4 rounded-xl bg-background/58 px-4 py-4';
  const overlayCard2Class =
    'mt-3 rounded-xl bg-background/58 px-4 py-4';
  const actionButtonBaseClass =
    'inline-flex h-8 w-full items-center justify-center rounded-xl px-4 font-semibold text-[12px] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const controlButtonClass = `${actionButtonBaseClass} border border-border/60 bg-[#1C2433] text-foreground hover:bg-[#243149] disabled:cursor-not-allowed disabled:opacity-50`;
  const primaryButtonClass = `${actionButtonBaseClass} border border-primary/45 bg-primary text-primary-foreground hover:bg-primary/90`;
  const subtleInfoPanelClass =
    'space-y-2 rounded-xl bg-background/72 px-3.5 py-3.5';

  return (
    <section className={railShellClass} data-testid="live-studio-sessions-rail">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground text-2xl tracking-tight">
          {t('liveSessionsRail.title')}
        </h2>
        <span className={railCountBadgeClass}>{sessions.length}</span>
      </header>
      <p className="mt-3 text-muted-foreground text-[15px] leading-relaxed">
        {t('liveSessionsRail.description')}
      </p>

      <div className="mt-5 grid gap-5">
        {sessions.length === 0 && !isLoading ? (
          <p className="rounded-xl bg-background/60 px-4 py-3 text-muted-foreground text-sm">
            {t('liveSessionsRail.empty')}
          </p>
        ) : null}
        {sessions.map((session) => (
          <article className={sessionCardClass} key={session.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="line-clamp-1 font-semibold text-[17px] text-foreground">
                {session.title}
              </p>
              <span
                className={`inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full border border-border/55 bg-background/72 px-3 font-semibold text-xs ${statusClassByValue[session.status] ?? statusClassByValue.forming}`}
              >
                {session.status === 'live' ? (
                  <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" />
                ) : null}
                {toLiveSessionStatusLabel(session.status, t)}
              </span>
            </div>
            <p className="mt-3 line-clamp-2 text-[15px] text-muted-foreground leading-relaxed">
              {session.objective}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span className={sessionMetaPillClass}>
                {session.participantCount} {t('liveSessionsRail.joined')}
              </span>
              <span className={sessionMetaPillClass}>
                {session.messageCount} {t('liveSessionsRail.messages')}
              </span>
              <span className={sessionMetaPillClass}>
                {formatRelativeMinutes(session.lastActivityAt, t)}
              </span>
            </div>

            {/* Session Overlay — card 1: title + observers + prediction */}
            <div className={overlayCard1Class}>
              <p className="font-semibold text-[15px] text-foreground">
                {t('liveSessionsRail.overlay.title')}
              </p>
              <p className="mt-1 text-[15px] text-muted-foreground">
                {t('liveSessionsRail.overlay.observers')}{' '}
                {session.overlay.humanCount} |{' '}
                {t('liveSessionsRail.overlay.agents')}{' '}
                {session.overlay.agentCount}
              </p>
              {session.overlay.mergeSignalPct +
                session.overlay.rejectSignalPct >
                0 ? (
                <div className="mt-3">
                  <p className="font-bold text-[15px] text-foreground">
                    {t('liveSessionsRail.overlay.predictionSignal')}:
                  </p>
                  <p className="mt-0.5 text-[15px] text-muted-foreground">
                    {t('observerProfile.predictionOutcomeMerge')}{' '}
                    {session.overlay.mergeSignalPct}% /{' '}
                    {t('observerProfile.predictionOutcomeReject')}{' '}
                    {session.overlay.rejectSignalPct}%
                  </p>
                </div>
              ) : null}
            </div>

            {/* Session Overlay — card 2: latest message */}
            {session.overlay.latestMessage ? (
              <div className={overlayCard2Class}>
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  {session.overlay.latestMessage}
                </p>
              </div>
            ) : null}

            {/* Recap (completed only) */}
            {session.status === 'completed' && session.overlay.recapSummary ? (
              <div className={overlayCard2Class}>
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
                  {t('liveSessionsRail.overlay.autoRecap')}
                </p>
                <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground leading-relaxed">
                  {session.overlay.recapSummary}
                </p>
                {session.overlay.recapClipUrl ? (
                  <a
                    className="mt-1.5 inline-block text-sm text-primary underline-offset-2 hover:underline"
                    href={session.overlay.recapClipUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t('liveSessionsRail.overlay.openRecapClip')}
                  </a>
                ) : null}
              </div>
            ) : null}

            {/* Action buttons — full-width stacked */}
            <div className="mt-4 grid gap-2">
              <button
                className={controlButtonClass}
                disabled={
                  session.status === 'completed' ||
                  session.status === 'cancelled' ||
                  copilotStateBySession[session.id]?.status === 'loading' ||
                  copilotStateBySession[session.id]?.status === 'connecting'
                }
                onClick={() => handleRealtimeBootstrap(session)}
                type="button"
              >
                {copilotStateBySession[session.id]?.status === 'loading' ||
                  copilotStateBySession[session.id]?.status === 'connecting'
                  ? t('liveSessionsRail.controls.startingCopilot')
                  : t('liveSessionsRail.controls.startCopilot')}
              </button>
              {hasObserverToken ? null : (
                <Link
                  className={`${primaryButtonClass} text-center`}
                  href="/login"
                >
                  {t('liveSessionsRail.controls.signInRequired')}
                </Link>
              )}
            </div>
            {copilotStateBySession[session.id]?.status === 'ready' &&
              copilotStateBySession[session.id]?.bootstrap ? (
              <div className="space-y-2">
                <p className="text-[13px] text-chart-2">
                  {t('liveSessionsRail.ready.copilotReady')}{' '}
                  {copilotStateBySession[session.id]?.bootstrap?.sessionId}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {t('liveSessionsRail.ready.toolBridge')}:{' '}
                  {toolBridgeStateBySession[session.id]?.processedCount ?? 0}{' '}
                  {t('liveSessionsRail.ready.processed')}
                </p>
                {toolBridgeStateBySession[session.id]?.lastProcessedAt ? (
                  <p className="text-[13px] text-muted-foreground">
                    {t('liveSessionsRail.ready.lastSync')}:{' '}
                    {formatRelativeMinutes(
                      toolBridgeStateBySession[session.id]
                        ?.lastProcessedAt as string,
                      t,
                    )}
                  </p>
                ) : null}
                {copilotStateBySession[session.id]?.pushToTalkEnabled ? (
                  <div className={`mt-1 ${subtleInfoPanelClass}`}>
                    <p className="text-[13px] text-muted-foreground uppercase tracking-wide">
                      {t('liveSessionsRail.voice.title')}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 font-semibold text-xs uppercase tracking-wide ${getRealtimeStatusClassName(
                          voiceRuntimeStateBySession[session.id]?.status ??
                          'idle',
                        )}`}
                      >
                        {toRealtimeStatusLabel(
                          voiceRuntimeStateBySession[session.id]?.status ??
                          'idle',
                          t,
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className={controlButtonClass}
                        onPointerCancel={() =>
                          handlePushToTalkStop(session.id)
                        }
                        onPointerDown={() =>
                          handlePushToTalkStart(session.id)
                        }
                        onPointerLeave={() =>
                          handlePushToTalkStop(session.id)
                        }
                        onPointerUp={() => handlePushToTalkStop(session.id)}
                        type="button"
                      >
                        {voiceControlStateBySession[session.id]?.isHolding
                          ? t('liveSessionsRail.voice.listeningReleaseToSend')
                          : t('liveSessionsRail.voice.holdToTalk')}
                      </button>
                      <button
                        className={controlButtonClass}
                        onClick={() => handlePushToTalkInterrupt(session.id)}
                        type="button"
                      >
                        {t('liveSessionsRail.voice.interruptResponse')}
                      </button>
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      {t('liveSessionsRail.voice.interruptions')}:{' '}
                      {voiceControlStateBySession[session.id]
                        ?.interruptions ?? 0}
                    </p>
                    {voiceControlStateBySession[session.id]?.lastCommitAt ? (
                      <p className="text-[13px] text-muted-foreground">
                        {t('liveSessionsRail.voice.lastVoiceSend')}:{' '}
                        {formatRelativeMinutes(
                          voiceControlStateBySession[session.id]
                            ?.lastCommitAt as string,
                          t,
                        )}
                      </p>
                    ) : null}
                    <p className="text-[13px] text-muted-foreground">
                      {t('liveSessionsRail.voice.keyboardHold')}{' '}
                      <kbd className="rounded border border-border/55 bg-background/88 px-1.5 py-0.5 text-[13px] text-foreground/90">
                        Space
                      </kbd>{' '}
                      {t('liveSessionsRail.voice.toTalk')}
                      {voiceFocusSessionId === session.id
                        ? ` (${t('liveSessionsRail.voice.active')})`
                        : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    {t('liveSessionsRail.voice.unavailable')}
                  </p>
                )}
                {(transcriptStateBySession[session.id]?.liveText ||
                  transcriptStateBySession[session.id]?.finalText) && (
                    <div className={`mt-1 ${subtleInfoPanelClass}`}>
                      <p className="text-[13px] text-muted-foreground uppercase tracking-wide">
                        {t('liveSessionsRail.transcript.title')}
                      </p>
                      <p className="line-clamp-3 text-[13px] text-muted-foreground">
                        {transcriptStateBySession[session.id]?.liveText ||
                          transcriptStateBySession[session.id]?.finalText}
                      </p>
                      {transcriptStateBySession[session.id]?.lastEventAt ? (
                        <p className="text-[13px] text-muted-foreground">
                          {t('liveSessionsRail.transcript.updated')}:{' '}
                          {formatRelativeMinutes(
                            transcriptStateBySession[session.id]
                              ?.lastEventAt as string,
                            t,
                          )}
                        </p>
                      ) : null}
                      {transcriptStateBySession[session.id]?.persistedAt ? (
                        <p className="text-[13px] text-muted-foreground">
                          {t('liveSessionsRail.transcript.savedToChat')}:{' '}
                          {formatRelativeMinutes(
                            transcriptStateBySession[session.id]
                              ?.persistedAt as string,
                            t,
                          )}
                        </p>
                      ) : null}
                      {transcriptStateBySession[session.id]?.persistError ? (
                        <p className="text-[13px] text-destructive">
                          {transcriptStateBySession[session.id]?.persistError}
                        </p>
                      ) : null}
                    </div>
                  )}
              </div>
            ) : null}
            {voiceControlStateBySession[session.id]?.error ? (
              <p className="text-[13px] text-destructive">
                {voiceControlStateBySession[session.id]?.error}
              </p>
            ) : null}
            {toolBridgeStateBySession[session.id]?.error ? (
              <p className="text-[13px] text-destructive">
                {toolBridgeStateBySession[session.id]?.error}
              </p>
            ) : null}
            {copilotStateBySession[session.id]?.status === 'error' ? (
              <p className="text-[13px] text-destructive">
                {copilotStateBySession[session.id]?.error}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};
