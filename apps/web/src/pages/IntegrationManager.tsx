import { useState, type FormEvent } from 'react';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { get, post, patch, del, getErrorMessage } from '../lib/api.js';
import { useTenantQuery, useInvalidateTenant } from '../hooks/useTenantQuery.js';
import { toast } from '../store/toast.js';

type Connection = { id: string; name: string; type?: string; provider?: string; mode?: string; active: boolean; isDefault: boolean; config: Record<string, unknown>; lastTestAt?: string; lastTestOk?: boolean; lastTestMsg?: string };
type Category = 'erp' | 'whatsapp';
const endpoints: Record<Category, string> = { erp: '/erp-connections', whatsapp: '/whatsapp-connections' };
const providers: Record<Category, string[]> = { erp: ['sgp', 'ixcsoft', 'hubsoft', 'sql_generic', 'ispfy', 'atlaz', 'receitanet'], whatsapp: ['meta', 'evolution', 'zapi'] };
const providerNames: Record<string, string> = { sgp: 'SGP', ixcsoft: 'IXC Soft', hubsoft: 'HubSoft', sql_generic: 'SQL Genérico', ispfy: 'ISPFY', atlaz: 'Atlaz', receitanet: 'ReceitaNet', meta: 'WhatsApp Business API (Meta)', evolution: 'Evolution API', zapi: 'Z-API' };

interface FieldDef { key: string; label: string; placeholder?: string; type?: 'text' | 'password'; secret?: boolean; hint?: string; half?: boolean }

/** Campos amigaveis por provedor (modo API). Chaves secretas vao para secrets; as demais para config. */
const fields: Record<string, FieldDef[]> = {
  sgp: [
    { key: 'baseUrl', label: 'URL do SGP', placeholder: 'https://suaempresa.sgp.net.br', hint: 'Endereço do painel do seu SGP' },
    { key: 'token', label: 'Token de integração', type: 'password', secret: true, hint: 'SGP → Administração → Integrações → Tokens' },
    { key: 'app', label: 'App (nome da aplicação do token)', placeholder: 'ura', half: true },
    { key: 'planoId', label: 'ID do plano para pré-cadastro (opcional)', half: true, hint: 'Plano usado quando a URA cadastra um novo cliente' },
  ],
  ixcsoft: [
    { key: 'baseUrl', label: 'URL do IXC', placeholder: 'https://suaempresa.ixcsoft.com.br' },
    { key: 'token', label: 'Token da API', type: 'password', secret: true, hint: 'IXC → Configurações → API' },
  ],
  hubsoft: [
    { key: 'baseUrl', label: 'URL da HubSoft', placeholder: 'https://api.hubsoft.com.br' },
    { key: 'clientId', label: 'Client ID', half: true },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', secret: true, half: true },
  ],
  meta: [
    { key: 'phoneNumberId', label: 'Phone Number ID', hint: 'Meta Developers → WhatsApp → sua aplicação' },
    { key: 'token', label: 'Token de acesso permanente', type: 'password', secret: true },
  ],
  evolution: [
    { key: 'baseUrl', label: 'URL da Evolution API', placeholder: 'https://evolution.suaempresa.com' },
    { key: 'instance', label: 'Instância', half: true },
    { key: 'apiKey', label: 'API Key', type: 'password', secret: true, half: true },
  ],
  zapi: [
    { key: 'instanceId', label: 'Instance ID', half: true },
    { key: 'token', label: 'Token', type: 'password', secret: true, half: true },
    { key: 'clientToken', label: 'Client Token (opcional)', type: 'password', secret: true },
  ],
};

/** Campos de conexao de banco (modo database para ERP). */
const dbFields: FieldDef[] = [
  { key: 'host', label: 'Host', half: true, placeholder: '192.168.0.10' },
  { key: 'port', label: 'Porta', half: true, placeholder: '5432' },
  { key: 'database', label: 'Banco de dados', half: true },
  { key: 'user', label: 'Usuário', half: true },
  { key: 'password', label: 'Senha', type: 'password', secret: true },
];

export function IntegrationManager({ category }: { category: Category }) {
  const endpoint = endpoints[category];
  const key = ['integration-manager', category];
  const query = useTenantQuery(key, () => get<Connection[]>(endpoint));
  const invalidate = useInvalidateTenant();
  const [editing, setEditing] = useState<Connection | 'new' | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState(providers[category][0]);
  const [mode, setMode] = useState('api');
  const [values, setValues] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState('{}');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const activeFields = category === 'erp' && mode === 'database' ? dbFields : (fields[provider] ?? []);
  const open = (item: Connection | 'new') => {
    setEditing(item);
    setName(item === 'new' ? '' : item.name);
    setProvider(item === 'new' ? providers[category][0] : String(item.type ?? item.provider));
    setMode(item === 'new' ? 'api' : item.mode ?? 'api');
    const itemProvider = String(item === 'new' ? providers[category][0] : item.type ?? item.provider);
    const itemMode = item === 'new' ? 'api' : item.mode ?? 'api';
    const cfg = (item === 'new' ? {} : item.config) as Record<string, unknown>;
    const defs = category === 'erp' && itemMode === 'database' ? dbFields : (fields[itemProvider] ?? []);
    const initial: Record<string, string> = {};
    for (const f of defs) {
      if (!f.secret && typeof cfg[f.key] === 'string') initial[f.key] = String(cfg[f.key]);
    }
    setValues(initial);
    const rest = { ...cfg };
    for (const f of defs) delete rest[f.key];
    setAdvanced(JSON.stringify(rest, null, 2));
    setActive(item === 'new' ? true : item.active);
  };
  const setField = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      let extra: Record<string, unknown> = {};
      try { extra = advanced.trim() ? JSON.parse(advanced) as Record<string, unknown> : {}; } catch { throw new Error('Configuração avançada deve ser um JSON válido'); }
      const config: Record<string, unknown> = { ...extra };
      const secrets: Record<string, string> = {};
      for (const f of activeFields) {
        const v = (values[f.key] ?? '').trim();
        if (!v) continue;
        if (f.secret) secrets[f.key] = v;
        else config[f.key] = v;
      }
      if (category === 'erp' && mode === 'database' && !config.dialect) config.dialect = provider === 'sql_generic' ? 'postgres' : undefined;
      const body = { name, [category === 'erp' ? 'type' : 'provider']: provider, ...(category === 'erp' && { mode }), config, secrets, active };
      if (editing === 'new') await post(endpoint, body);
      else if (editing) await patch(`${endpoint}/${editing.id}`, body);
      await invalidate(key); setEditing(null); toast.success('Conexão salva');
    } catch (error) { toast.error('Erro ao salvar conexão', getErrorMessage(error)); } finally { setSaving(false); }
  };
  const test = async (item: Connection) => {
    setTesting(item.id);
    try {
      const res = await post<{ ok: boolean; message: string; latencyMs?: number }>(`${endpoint}/${item.id}/test`, {});
      if (res.ok) toast.success(`${item.name}: ${res.message}`);
      else toast.error(`${item.name}: ${res.message}`);
      await invalidate(key);
    } catch (error) { toast.error('Erro ao testar conexão', getErrorMessage(error)); } finally { setTesting(null); }
  };
  const remove = async (item: Connection) => {
    if (!window.confirm(`Excluir a conexão ${item.name}?`)) return;
    try { await del(`${endpoint}/${item.id}`); await invalidate(key); toast.success('Conexão excluída'); }
    catch (error) { toast.error('Erro ao excluir conexão', getErrorMessage(error)); }
  };
  return <Card title={category === 'erp' ? 'ERP' : 'WhatsApp'} actions={<Button onClick={() => open('new')}>Adicionar</Button>}>
    {query.isLoading && <p>Carregando...</p>}{query.error && <p role="alert" className="text-red-700">{getErrorMessage(query.error)}</p>}
    {query.data?.length === 0 && <p className="text-slate-500">Nenhuma conexão cadastrada.</p>}
    {query.data?.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3">
      <div>
        <strong>{item.name}</strong>
        <span className="ml-2 text-sm text-slate-500">{providerNames[String(item.type ?? item.provider)] ?? item.type ?? item.provider}{item.mode ? ` · ${item.mode === 'api' ? 'API' : 'Banco'}` : ''} · {item.active ? 'Ativa' : 'Inativa'}</span>
        {item.lastTestAt && <span className={`ml-2 inline-flex items-center gap-1.5 text-xs ${item.lastTestOk ? 'text-emerald-700' : 'text-red-600'}`}><span className={`h-2 w-2 rounded-full ${item.lastTestOk ? 'bg-emerald-500' : 'bg-red-500'}`} />{item.lastTestOk ? 'Conectado' : `Falhou: ${item.lastTestMsg ?? ''}`.slice(0, 80)}</span>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" loading={testing === item.id} onClick={() => void test(item)}>Testar</Button>
        <Button size="sm" variant="outline" onClick={() => open(item)}>Editar</Button>
        <Button size="sm" variant="danger" onClick={() => void remove(item)}>Excluir</Button>
      </div>
    </div>)}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-3" onClick={() => setEditing(null)}><div role="dialog" aria-label="Configurar conexão" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-6" onClick={(event) => event.stopPropagation()}>
      <h2 className="mb-4 text-lg font-bold text-brand-navy">Configurar {category === 'erp' ? 'ERP' : 'WhatsApp'}</h2>
      <form className="space-y-3" onSubmit={(event) => void save(event)}>
        <label className="label block">Nome<input className="input mt-1" required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="label block">Provedor<select className="input mt-1" value={provider} onChange={(event) => { setProvider(event.target.value); setValues({}); }}>{providers[category].map((option) => <option value={option} key={option}>{providerNames[option] ?? option}</option>)}</select></label>
          {category === 'erp' && <label className="label block">Modo<select className="input mt-1" value={mode} onChange={(event) => { setMode(event.target.value); setValues({}); }}><option value="api">API</option><option value="database">Banco de dados</option></select></label>}
        </div>
        {activeFields.length > 0
          ? <div className="grid gap-3 sm:grid-cols-2">{activeFields.map((f) => <label key={f.key} className={`label block ${f.half ? '' : 'sm:col-span-2'}`}>{f.label}<input className="input mt-1" type={f.type ?? 'text'} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(event) => setField(f.key, event.target.value)} />{f.hint && <span className="mt-1 block text-xs font-normal text-slate-500">{f.hint}</span>}</label>)}</div>
          : <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Este provedor ainda não tem formulário dedicado — configure os campos em JSON avançado abaixo.</p>}
        <label className="label block">Configuração avançada (JSON, opcional)<textarea className="input mt-1 min-h-20 font-mono text-xs" value={advanced} onChange={(event) => setAdvanced(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Ativa</label>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" loading={saving}>Salvar</Button></div>
      </form>
    </div></div>}
  </Card>;
}
