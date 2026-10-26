import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Hash, ArrowUpRight, GripVertical } from 'lucide-react';
import { useSoftphoneStore } from './softphone.js';

const STORAGE_KEY = 'ura-softphone-position';

export function SoftphonePanel() {
  const s = useSoftphoneStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState<{ x: number | null; y: number | null }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as { x: number; y: number }) : { x: null, y: null };
    } catch {
      return { x: null, y: null };
    }
  });

  useEffect(() => {
    if (pos.x == null || pos.y == null) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch {
      return;
    }
  }, [pos]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || event.pointerId !== activePointerIdRef.current) return;
      const panel = panelRef.current;
      if (!panel) return;
      const x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - offsetRef.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, event.clientY - offsetRef.current.y));
      setPos({ x, y });
    };

    const stopDragging = (event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return;
      draggingRef.current = false;
      activePointerIdRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    event.preventDefault();
    draggingRef.current = true;
    activePointerIdRef.current = event.pointerId;
    const rect = panel.getBoundingClientRect();
    offsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  if (!s.panelOpen) return null;
  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
      style={pos.x != null && pos.y != null ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : { right: '1rem', bottom: '1rem' }}
    >
      <div
        className="mb-3 -m-2 mb-3 flex cursor-grab touch-none items-center justify-between rounded-md bg-slate-50 p-2 active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        <div className="flex items-center gap-2">
          <GripVertical size={16} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-800">Softphone</span>
        </div>
        <span
          className={`h-2 w-2 rounded-full ${
            s.registration === 'registered' ? 'bg-green-500' : s.registration === 'error' ? 'bg-red-500' : 'bg-amber-400'
          }`}
        />
      </div>
      <p className="mb-2 text-xs text-slate-600">
        {s.registration === 'registered' ? 'Conectado ao servidor VoIP' : s.registration === 'registering' ? 'Conectando ao servidor VoIP…' : 'Desconectado'}
      </p>
      {s.extensionOptions.length > 0 && (
        <label className="mb-3 block text-xs font-medium text-slate-700">
          Selecione o ramal WebRTC
          <select
            value={s.selectedExtensionId}
            onChange={(event) => s.selectExtension(event.target.value)}
            className="input mt-1"
          >
            <option value="">Selecione um ramal</option>
            {s.extensionOptions.map((extension) => (
              <option key={extension.id} value={extension.id}>
                {extension.number} — {extension.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {s.registrationError && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
          {s.registrationError === 'no_extension'
            ? 'Sua conta não tem ramal vinculado. Associe um ramal WebRTC em Usuários ou use uma conta administradora.'
            : s.registrationError === 'select_extension'
              ? 'Selecione o ramal acima e clique em Conectar.'
              : s.registrationError === 'no_webrtc_extensions'
                ? 'Não há ramais WebRTC ativos disponíveis para esta empresa.'
                : s.registrationError === 'not_webrtc'
                  ? 'O ramal associado não é WebRTC. Associe um ramal do tipo WebRTC.'
                  : `Falha no registro SIP: ${s.registrationError}`}
        </p>
      )}
      {s.registration === 'registered' ? (
        <button onClick={() => s.disconnect()} className="mb-3 w-full rounded-md bg-slate-100 py-2 text-sm text-slate-700 hover:bg-slate-200">
          Desconectar
        </button>
      ) : (
        <button onClick={() => void s.connect()} disabled={s.registration === 'registering'} className="mb-3 w-full rounded-md bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60">
          {s.registration === 'registering' ? 'Conectando…' : 'Conectar / tentar novamente'}
        </button>
      )}
      <input
        value={s.dialInput}
        onChange={(e) => s.setDialInput(e.target.value)}
        placeholder="Numero"
        className="input mb-3"
      />
      <div className="grid grid-cols-3 gap-2">
        {['1','2','3','4','5','6','7','8','9','*','0','#'].map((d) => (
          <button
            key={d}
            onClick={() => {
              s.setDialInput(s.dialInput + d);
              s.sendDTMF(d);
            }}
            className="rounded-md bg-slate-100 py-2 text-sm font-medium hover:bg-slate-200"
          >
            {d}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {s.callState === 'idle' ? (
          <button onClick={() => s.call(s.dialInput)} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-green-600 py-2 text-white">
            <Phone size={16} /> Ligar
          </button>
        ) : s.callState === 'ringing-in' ? (
          <button onClick={() => s.answer()} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-green-600 py-2 text-white">
            <Phone size={16} /> Atender
          </button>
        ) : null}
        {(s.callState !== 'idle') && (
          <button onClick={() => s.hangup()} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-red-600 py-2 text-white">
            <PhoneOff size={16} /> Desligar
          </button>
        )}
      </div>
      {s.callState !== 'idle' && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => s.toggleMute()} className="rounded-md bg-slate-100 p-2" title="Mudo">
            {s.muted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button onClick={() => s.toggleHold()} className="rounded-md bg-slate-100 p-2" title="Espera">
            {s.callState === 'hold' ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button onClick={() => s.transfer(s.dialInput)} className="rounded-md bg-slate-100 p-2" title="Transferir">
            <ArrowUpRight size={16} />
          </button>
          <button onClick={() => s.sendDTMF('#')} className="rounded-md bg-slate-100 p-2" title="DTMF #">
            <Hash size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
