import { useState, type FormEvent } from 'react';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { get, post, patch, del, getErrorMessage } from '../lib/api.js';
import { useTenantQuery, useInvalidateTenant } from '../hooks/useTenantQuery.js';
import { toast } from '../store/toast.js';

type Connection = { id: string; name: string; type?: string; provider?: string; mode?: string; active: boolean; isDefault: boolean; config: Record<string, unknown> };
type Category = 'erp' | 'whatsapp';
const endpoints: Record<Category, string> = { erp: '/erp-connections', whatsapp: '/whatsapp-connections' };
const providers: Record<Category, string[]> = { erp: ['sql_generic', 'ixcsoft', 'sgp', 'hubsoft', 'ispfy', 'atlaz', 'receitanet'], whatsapp: ['meta', 'evolution', 'zapi'] };

export function IntegrationManager({ category }: { category: Category }) {
  const endpoint = endpoints[category];
  const key = ['integration-manager', category];
  const query = useTenantQuery(key, () => get<Connection[]>(endpoint));
  const invalidate = useInvalidateTenant();
  const [editing, setEditing] = useState<Connection | 'new' | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState(providers[category][0]);
  const [mode, setMode] = useState('database');
  const [config, setConfig] = useState('{}');
  const [secrets, setSecrets] = useState('{}');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const open = (item: Connection | 'new') => {
    setEditing(item); setName(item === 'new' ? '' : item.name);
    setProvider(item === 'new' ? providers[category][0] : String(item.type ?? item.provider));
    setMode(item === 'new' ? 'database' : item.mode ?? 'database');
    setConfig(JSON.stringify(item === 'new' ? {} : item.config, null, 2)); setSecrets('{}');
    setActive(item === 'new' ? true : item.active);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const data = JSON.parse(config) as Record<string, unknown>;
      const credentials = JSON.parse(secrets) as Record<string, string>;
      if (!data || Array.isArray(data) || typeof data !== 'object' || !credentials || Array.isArray(credentials) || typeof credentials !== 'object' || Object.values(credentials).some((value) => typeof value !== 'string')) throw new Error('Configuração deve ser um objeto JSON; segredos devem ser pares texto/texto.');
      const body = { name, [category === 'erp' ? 'type' : 'provider']: provider, ...(category === 'erp' && { mode }), config: data, secrets: credentials, active };
      if (editing === 'new') await post(endpoint, body);
      else if (editing) await patch(`${endpoint}/${editing.id}`, body);
      await invalidate(key); setEditing(null); toast.success('Conexão salva');
    } catch (error) { toast.error('Erro ao salvar conexão', getErrorMessage(error)); } finally { setSaving(false); }
  };
  const remove = async (item: Connection) => {
    if (!window.confirm(`Excluir a conexão ${item.name}?`)) return;
    try { await del(`${endpoint}/${item.id}`); await invalidate(key); toast.success('Conexão excluída'); }
    catch (error) { toast.error('Erro ao excluir conexão', getErrorMessage(error)); }
  };
  return <Card title={category === 'erp' ? 'ERP' : 'WhatsApp'} actions={<Button onClick={() => open('new')}>Adicionar</Button>}>
    {query.isLoading && <p>Carregando...</p>}{query.error && <p role="alert" className="text-red-700">{getErrorMessage(query.error)}</p>}
    {query.data?.length === 0 && <p className="text-slate-500">Nenhuma conexão cadastrada.</p>}
    {query.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3"><div><strong>{item.name}</strong><span className="ml-2 text-sm text-slate-500">{item.type ?? item.provider} · {item.active ? 'Ativa' : 'Inativa'}</span></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => open(item)}>Editar</Button><Button size="sm" variant="danger" onClick={() => void remove(item)}>Excluir</Button></div></div>)}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-3" onClick={() => setEditing(null)}><div role="dialog" aria-label="Configurar conexão" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-6" onClick={(event) => event.stopPropagation()}><h2 className="mb-4 text-lg font-bold text-brand-navy">Configurar {category === 'erp' ? 'ERP' : 'WhatsApp'}</h2><form className="space-y-3" onSubmit={(event) => void save(event)}><label className="label block">Nome<input className="input mt-1" required value={name} onChange={(event) => setName(event.target.value)} /></label><label className="label block">Provedor<select className="input mt-1" value={provider} onChange={(event) => setProvider(event.target.value)}>{providers[category].map((option) => <option value={option} key={option}>{option}</option>)}</select></label>{category === 'erp' && <label className="label block">Modo<select className="input mt-1" value={mode} onChange={(event) => setMode(event.target.value)}><option value="api">API</option><option value="database">Banco de dados</option></select></label>}<label className="label block">Configuração (JSON)<textarea className="input mt-1 min-h-28 font-mono" value={config} onChange={(event) => setConfig(event.target.value)} /></label><label className="label block">Credenciais (JSON, criptografadas; deixe vazio para manter as atuais)<textarea className="input mt-1 min-h-20 font-mono" value={secrets} onChange={(event) => setSecrets(event.target.value)} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Ativa</label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" loading={saving}>Salvar</Button></div></form></div></div>}
  </Card>;
}
