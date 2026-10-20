import { useState } from 'react';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { get, post, del, getErrorMessage } from '../lib/api.js';
import { useInvalidateTenant, useTenantQuery } from '../hooks/useTenantQuery.js';
import { toast } from '../store/toast.js';

type Member = { extensionId: string; extension: { number: string; name: string } };
type Queue = { id: string; name: string; members: Member[] };
type Extension = { id: string; number: string; name: string };

export function QueueMembers({ queue, close }: { queue: Queue; close: () => void }) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateTenant();
  const extensions = useTenantQuery(['resource', 'extensions'], () => get<Extension[]>('/extensions'));
  const queues = useTenantQuery(['resource', 'queues'], () => get<Queue[]>('/queues'));
  const members = queues.data?.find((item) => item.id === queue.id)?.members ?? queue.members;
  const add = async () => {
    if (!selected) return;
    setBusy(true);
    try { await post(`/queues/${queue.id}/members`, { extensionId: selected, penalty: 0 }); await invalidate(['resource', 'queues']); setSelected(''); toast.success('Ramal adicionado'); }
    catch (error) { toast.error('Erro ao adicionar ramal', getErrorMessage(error)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await del(`/queues/${queue.id}/members/${id}`); await invalidate(['resource', 'queues']); toast.success('Ramal removido'); }
    catch (error) { toast.error('Erro ao remover ramal', getErrorMessage(error)); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-3" onClick={close}><div role="dialog" aria-label={`Ramais da fila ${queue.name}`} className="w-full max-w-lg rounded-xl bg-white p-6" onClick={(event) => event.stopPropagation()}><h2 className="mb-4 text-lg font-bold text-brand-navy">Ramais · {queue.name}</h2><Card padded={false}>{members.length ? members.map((item) => <div key={item.extensionId} className="flex items-center justify-between border-b border-slate-100 p-3"><span>{item.extension?.number} · {item.extension?.name}</span><Button size="sm" variant="danger" onClick={() => void remove(item.extensionId)}>Remover</Button></div>) : <p className="p-3 text-slate-500">Nenhum ramal associado.</p>}</Card><div className="mt-4 flex gap-2"><select aria-label="Ramal para adicionar" className="input" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Selecione o ramal</option>{extensions.data?.filter((item) => !members.some((member) => member.extensionId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.number} · {item.name}</option>)}</select><Button loading={busy} disabled={!selected} onClick={() => void add()}>Adicionar</Button></div>{extensions.error && <p role="alert" className="mt-2 text-red-700">{getErrorMessage(extensions.error)}</p>}<div className="mt-4 text-right"><Button variant="outline" onClick={close}>Fechar</Button></div></div></div>;
}
