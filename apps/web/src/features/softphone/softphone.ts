import { create } from 'zustand';
import JsSIP from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import type { IncomingRTCSessionEvent, UA } from 'jssip/lib/UA';
import { get, getErrorMessage } from '../../lib/api';
import type { Extension, ExtensionCredentials } from '../../types/api';
import { useAuthStore } from '../../store/auth';
import { startRingtone, stopRingtone } from './ringtone';

export type RegistrationState = 'unregistered' | 'registering' | 'registered' | 'error';
export type CallState = 'idle' | 'ringing-in' | 'ringing-out' | 'active' | 'hold';

export interface CallLogEntry {
  id: string;
  number: string;
  direction: 'in' | 'out';
  startedAt: number;
  durationSec: number;
  answered: boolean;
}

interface SoftphoneState {
  panelOpen: boolean;
  registration: RegistrationState;
  registrationError?: string;
  credentials: ExtensionCredentials | null;
  extensionType: 'sip' | 'webrtc' | null;
  extensionOptions: Extension[];
  selectedExtensionId: string;
  callState: CallState;
  remoteNumber: string;
  muted: boolean;
  /** inicio da chamada ativa (ms) */
  callStartedAt: number | null;
  log: CallLogEntry[];
  dialInput: string;

  togglePanel: (open?: boolean) => void;
  setDialInput: (v: string) => void;
  /** Carrega credenciais do ramal do usuario e registra. */
  connect: () => Promise<void>;
  selectExtension: (id: string) => void;
  disconnect: () => void;
  call: (target: string) => void;
  answer: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  sendDTMF: (tone: string) => void;
  transfer: (target: string) => void;
}

let ua: UA | null = null;
let session: RTCSession | null = null;
let remoteAudio: HTMLAudioElement | null = null;

function selectedExtensionStorageKey(): string | null {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `ura.softphone.extension.${userId}` : null;
}

function loadSelectedExtensionId(): string {
  const key = selectedExtensionStorageKey();
  if (!key || typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function saveSelectedExtensionId(id: string): void {
  const key = selectedExtensionStorageKey();
  if (!key || typeof window === 'undefined') return;
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

function ensureAudio(): HTMLAudioElement {
  if (!remoteAudio) {
    remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute('playsinline', 'true');
    remoteAudio.style.display = 'none';
    document.body.appendChild(remoteAudio);
  }
  return remoteAudio;
}

function iceServers(creds: ExtensionCredentials | null): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (creds?.turn?.urls?.length) {
    servers.push({ urls: creds.turn.urls, username: creds.turn.username, credential: creds.turn.credential });
  }
  return servers;
}

function parseRemote(uri: unknown): string {
  try {
    const u = uri as { user?: string; toString?: () => string } | undefined;
    if (u?.user) return u.user;
    return u?.toString?.() ?? '';
  } catch {
    return '';
  }
}

export const useSoftphoneStore = create<SoftphoneState>()((set, getState) => {
  const attachSession = (s: RTCSession, direction: 'in' | 'out', number: string) => {
    session = s;
    const startedAt = Date.now();
    let answered = false;

    s.on('peerconnection', (e) => {
      const pc = e.peerconnection;
      pc.addEventListener('track', (ev: RTCTrackEvent) => {
        const audio = ensureAudio();
        if (ev.streams && ev.streams[0]) audio.srcObject = ev.streams[0];
        else {
          const stream = new MediaStream([ev.track]);
          audio.srcObject = stream;
        }
        void audio.play().catch(() => undefined);
      });
    });
    s.on('progress', () => {
      if (direction === 'out') set({ callState: 'ringing-out' });
    });
    s.on('accepted', () => {
      answered = true;
      stopRingtone();
      set({ callState: 'active', callStartedAt: Date.now() });
    });
    s.on('confirmed', () => {
      // Para chamadas atendidas localmente, pode ser que 'accepted' nao dispare
      if (getState().callState !== 'active' && getState().callState !== 'hold') {
        answered = true;
        stopRingtone();
        set({ callState: 'active', callStartedAt: Date.now() });
      }
      // Fallback para browsers sem evento track (streams via receivers)
      try {
        const pc = s.connection;
        if (pc && remoteAudio && !remoteAudio.srcObject) {
          const stream = new MediaStream();
          pc.getReceivers().forEach((r) => r.track && stream.addTrack(r.track));
          remoteAudio.srcObject = stream;
          void remoteAudio.play().catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
    });
    s.on('hold', () => set({ callState: 'hold' }));
    s.on('unhold', () => set({ callState: 'active' }));
    s.on('muted', () => set({ muted: true }));
    s.on('unmuted', () => set({ muted: false }));
    const finish = () => {
      stopRingtone();
      const st = getState();
      const durationSec = st.callStartedAt ? Math.floor((Date.now() - st.callStartedAt) / 1000) : 0;
      const entry: CallLogEntry = { id: `${startedAt}`, number, direction, startedAt, durationSec, answered };
      session = null;
      if (remoteAudio) remoteAudio.srcObject = null;
      set({ callState: 'idle', remoteNumber: '', muted: false, callStartedAt: null, log: [entry, ...st.log].slice(0, 30) });
    };
    s.on('ended', finish);
    s.on('failed', finish);
  };

  return {
    panelOpen: false,
    registration: 'unregistered',
    credentials: null,
    extensionType: null,
    extensionOptions: [],
    selectedExtensionId: loadSelectedExtensionId(),
    callState: 'idle',
    remoteNumber: '',
    muted: false,
    callStartedAt: null,
    log: [],
    dialInput: '',

    togglePanel: (open) => set((s) => ({ panelOpen: open ?? !s.panelOpen })),
    setDialInput: (v) => set({ dialInput: v }),
    selectExtension: (id) => {
      saveSelectedExtensionId(id);
      set({ selectedExtensionId: id, registrationError: undefined });
    },

    connect: async () => {
      const user = useAuthStore.getState().user;
      let ext = user?.extension;
      if ((!ext || ext.type !== 'webrtc') && (user?.role === 'superadmin' || user?.role === 'tenant_admin')) {
        try {
          const extensionOptions = (await get<Extension[]>('/extensions')).filter((option) => option.type === 'webrtc' && option.active);
          const selectedExtensionId = getState().selectedExtensionId || loadSelectedExtensionId();
          ext = extensionOptions.find((option) => option.id === selectedExtensionId);
          set({ extensionOptions, selectedExtensionId });
          if (!ext) {
            set({ registration: 'error', registrationError: extensionOptions.length ? 'select_extension' : 'no_webrtc_extensions' });
            return;
          }
        } catch (err) {
          set({ registration: 'error', registrationError: getErrorMessage(err) });
          return;
        }
      }
      if (!ext) {
        set({ registration: 'error', registrationError: 'no_extension', extensionType: null });
        return;
      }
      set({ extensionType: ext.type });
      if (ext.type !== 'webrtc') {
        set({ registration: 'unregistered', registrationError: 'not_webrtc' });
        return;
      }
      set({ registration: 'registering', registrationError: undefined });
      try {
        const creds = await get<ExtensionCredentials>(`/extensions/${ext.id}/credentials`);
        getState().disconnect();
        set({ credentials: creds, registration: 'registering', registrationError: undefined });
        const socket = new JsSIP.WebSocketInterface(creds.wssUrl);
        ua = new JsSIP.UA({
          sockets: [socket],
          uri: `sip:${creds.username}@${creds.domain}`,
          password: creds.secret,
          register: true,
          session_timers: false,
          display_name: ext.name,
        });
        ua.on('registered', () => set({ registration: 'registered', registrationError: undefined }));
        ua.on('unregistered', () => set({ registration: 'unregistered' }));
        ua.on('registrationFailed', (e) => set({ registration: 'error', registrationError: e.cause || 'registration_failed' }));
        ua.on('disconnected', () => {
          if (getState().registration === 'registered') set({ registration: 'unregistered' });
        });
        ua.on('newRTCSession', (e: IncomingRTCSessionEvent) => {
          const s = e.session;
          if (s.direction === 'incoming') {
            if (session) {
              s.terminate({ status_code: 486 });
              return;
            }
            const number = parseRemote(s.remote_identity?.uri) || s.remote_identity?.display_name || '';
            attachSession(s, 'in', number);
            set({ callState: 'ringing-in', remoteNumber: number, panelOpen: true });
            startRingtone();
          }
        });
        ua.start();
      } catch (err) {
        set({ registration: 'error', registrationError: getErrorMessage(err) });
      }
    },

    disconnect: () => {
      stopRingtone();
      if (session) {
        try {
          session.terminate();
        } catch {
          /* ignore */
        }
        session = null;
      }
      if (ua) {
        try {
          ua.stop();
        } catch {
          /* ignore */
        }
        ua = null;
      }
      set({ registration: 'unregistered', callState: 'idle', remoteNumber: '', muted: false, callStartedAt: null });
    },

    call: (target) => {
      const creds = getState().credentials;
      const clean = target.trim();
      if (!ua || !creds || !clean || session) return;
      try {
        const s = ua.call(`sip:${clean}@${creds.domain}`, {
          mediaConstraints: { audio: true, video: false },
          pcConfig: { iceServers: iceServers(creds) },
          rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
        });
        attachSession(s, 'out', clean);
        set({ callState: 'ringing-out', remoteNumber: clean, panelOpen: true, dialInput: '' });
      } catch (err) {
        set({ registrationError: err instanceof Error ? err.message : String(err) });
      }
    },

    answer: () => {
      if (!session || session.direction !== 'incoming') return;
      stopRingtone();
      session.answer({
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: iceServers(getState().credentials) },
      });
    },

    hangup: () => {
      stopRingtone();
      if (session) {
        try {
          session.terminate();
        } catch {
          /* ignore */
        }
      }
    },

    toggleMute: () => {
      if (!session) return;
      if (getState().muted) session.unmute({ audio: true });
      else session.mute({ audio: true });
    },

    toggleHold: () => {
      if (!session) return;
      if (getState().callState === 'hold') session.unhold();
      else session.hold();
    },

    sendDTMF: (tone) => {
      if (!session || !/^[0-9*#A-D]$/.test(tone)) return;
      try {
        session.sendDTMF(tone);
      } catch {
        /* ignore */
      }
    },

    transfer: (target) => {
      const creds = getState().credentials;
      const clean = target.trim();
      if (!session || !creds || !clean) return;
      try {
        session.refer(`sip:${clean}@${creds.domain}`);
      } catch {
        /* ignore */
      }
    },
  };
});

// Desconecta ao sair
useAuthStore.subscribe((s, prev) => {
  if (prev.accessToken && !s.accessToken) {
    useSoftphoneStore.getState().disconnect();
  }
});
