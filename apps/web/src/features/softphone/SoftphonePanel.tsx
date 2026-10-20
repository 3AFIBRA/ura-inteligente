import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Hash, ArrowUpRight } from 'lucide-react';
import { useSoftphoneStore } from './softphone.js';

export function SoftphonePanel() {
  const s = useSoftphoneStore();
  if (!s.panelOpen) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">Softphone</span>
        <span
          className={`h-2 w-2 rounded-full ${
            s.registration === 'registered' ? 'bg-green-500' : s.registration === 'error' ? 'bg-red-500' : 'bg-amber-400'
          }`}
        />
      </div>
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
