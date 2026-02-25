type RealtimeOutputModality = 'text' | 'audio';

export interface RealtimeCopilotBootstrapPayload {
  provider: 'openai';
  sessionId: string;
  clientSecret: string;
  model?: string;
  outputModalities?: RealtimeOutputModality[];
  pushToTalk?: boolean;
}

export interface OpenAIRealtimeConnection {
  readonly liveSessionId: string;
  readonly sessionId: string;
  readonly pushToTalkEnabled: boolean;
  sendClientEvent: (event: Record<string, unknown>) => void;
  startPushToTalk: () => void;
  stopPushToTalk: () => void;
  interrupt: () => void;
  close: () => void;
}

export interface ConnectOpenAIRealtimeInput {
  liveSessionId: string;
  bootstrap: RealtimeCopilotBootstrapPayload;
  onServerEvent: (event: unknown) => void;
  onError?: (message: string) => void;
}

const OPENAI_REALTIME_WEBRTC_URL = 'https://api.openai.com/v1/realtime';
const FALLBACK_MODEL = 'gpt-realtime';
const EVENT_CHANNEL_LABEL = 'oai-events';

const parseServerMessage = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const waitForIceGatheringComplete = async (
  peerConnection: RTCPeerConnection,
  timeoutMs = 4000,
) => {
  if (peerConnection.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      peerConnection.removeEventListener(
        'icegatheringstatechange',
        handleStateChange,
      );
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    const handleStateChange = () => {
      if (peerConnection.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };

    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error('ICE gathering timed out.'));
    }, timeoutMs);

    peerConnection.addEventListener(
      'icegatheringstatechange',
      handleStateChange,
    );
  });
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
};

export const connectOpenAIRealtimeConnection = async (
  input: ConnectOpenAIRealtimeInput,
): Promise<OpenAIRealtimeConnection> => {
  if (
    typeof window === 'undefined' ||
    typeof RTCPeerConnection === 'undefined'
  ) {
    throw new Error('WebRTC is not available in this environment.');
  }
  if (input.bootstrap.provider !== 'openai') {
    throw new Error('Unsupported realtime provider for WebRTC transport.');
  }

  const peerConnection = new RTCPeerConnection();
  const channel = peerConnection.createDataChannel(EVENT_CHANNEL_LABEL);
  const pendingEvents: string[] = [];
  let channelOpen = false;
  let pushToTalkActive = false;
  let pushToTalkEnabled = input.bootstrap.pushToTalk === true;
  let localStream: MediaStream | null = null;
  let localAudioTrack: MediaStreamTrack | null = null;

  const sendPayload = (event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    if (channelOpen && channel.readyState === 'open') {
      channel.send(payload);
      return;
    }
    pendingEvents.push(payload);
  };

  const ensureMicrophoneTrack = async () => {
    if (!pushToTalkEnabled) {
      return false;
    }
    if (localAudioTrack?.readyState === 'live') {
      return true;
    }
    if (typeof navigator === 'undefined') {
      throw new Error('Microphone capture is not available.');
    }
    const getUserMedia = navigator.mediaDevices?.getUserMedia;
    if (typeof getUserMedia !== 'function') {
      throw new Error('Microphone capture is not available.');
    }
    localStream = await getUserMedia.call(navigator.mediaDevices, {
      audio: true,
      video: false,
    });
    const track = localStream.getAudioTracks()[0];
    if (!track) {
      throw new Error('Microphone audio track is unavailable.');
    }
    track.enabled = false;
    peerConnection.addTrack(track, localStream);
    localAudioTrack = track;
    return true;
  };

  const audioElement = new Audio();
  audioElement.autoplay = true;
  peerConnection.ontrack = (event) => {
    audioElement.srcObject = event.streams[0] ?? null;
  };

  channel.onmessage = (event) => {
    input.onServerEvent(parseServerMessage(String(event.data ?? '')));
  };
  channel.onopen = () => {
    channelOpen = true;
    while (pendingEvents.length > 0) {
      const next = pendingEvents.shift();
      if (next) {
        channel.send(next);
      }
    }
  };
  channel.onerror = () => {
    input.onError?.('Realtime data channel failed.');
  };
  channel.onclose = () => {
    channelOpen = false;
  };

  if (pushToTalkEnabled) {
    try {
      await ensureMicrophoneTrack();
    } catch (error) {
      pushToTalkEnabled = false;
      input.onError?.(
        resolveErrorMessage(
          error,
          'Microphone permission is required for push-to-talk.',
        ),
      );
    }
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  const localDescription = peerConnection.localDescription;
  if (!(localDescription?.sdp && localDescription.type === 'offer')) {
    throw new Error('Unable to prepare WebRTC offer for realtime connection.');
  }

  const model =
    typeof input.bootstrap.model === 'string' &&
    input.bootstrap.model.length > 0
      ? input.bootstrap.model
      : FALLBACK_MODEL;
  const response = await fetch(
    `${OPENAI_REALTIME_WEBRTC_URL}?model=${encodeURIComponent(model)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.bootstrap.clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: localDescription.sdp,
    },
  );
  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(
      rawError.trim() ||
        `Realtime SDP exchange failed with ${response.status}.`,
    );
  }

  const answerSdp = await response.text();
  await peerConnection.setRemoteDescription({
    type: 'answer',
    sdp: answerSdp,
  });

  const stopPushToTalk = () => {
    if (!pushToTalkEnabled) {
      return;
    }
    if (localAudioTrack) {
      localAudioTrack.enabled = false;
    }
    if (!pushToTalkActive) {
      return;
    }
    sendPayload({ type: 'input_audio_buffer.commit' });
    sendPayload({ type: 'response.create' });
    pushToTalkActive = false;
  };

  const interrupt = () => {
    sendPayload({ type: 'response.cancel' });
    sendPayload({ type: 'output_audio_buffer.clear' });
    if (localAudioTrack) {
      localAudioTrack.enabled = false;
    }
    pushToTalkActive = false;
  };

  return {
    liveSessionId: input.liveSessionId,
    sessionId: input.bootstrap.sessionId,
    pushToTalkEnabled,
    sendClientEvent: (event) => {
      sendPayload(event);
    },
    startPushToTalk: () => {
      if (!pushToTalkEnabled) {
        return;
      }
      if (!(localAudioTrack && localAudioTrack.readyState === 'live')) {
        input.onError?.('Microphone is unavailable for push-to-talk.');
        return;
      }
      interrupt();
      sendPayload({ type: 'input_audio_buffer.clear' });
      localAudioTrack.enabled = true;
      pushToTalkActive = true;
    },
    stopPushToTalk,
    interrupt,
    close: () => {
      stopPushToTalk();
      try {
        channel.close();
      } catch {
        // no-op
      }
      try {
        peerConnection.close();
      } catch {
        // no-op
      }
      for (const track of localStream?.getTracks() ?? []) {
        try {
          track.stop();
        } catch {
          // no-op
        }
      }
      localAudioTrack = null;
      localStream = null;
      audioElement.srcObject = null;
    },
  };
};
