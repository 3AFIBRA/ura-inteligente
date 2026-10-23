import { useState, type FormEvent } from 'react';
import { IntegrationManager } from './IntegrationManager.js';
import { QueueMembers } from './QueueMembers.js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { get, post, patch, put, del, getErrorMessage } from '../lib/api.js';
import { useEffectiveTenantId, useInvalidateTenant, useTenantQuery } from '../hooks/useTenantQuery.js';
import { useAuthStore } from '../store/auth.js';
import { toast } from '../store/toast.js';
import type { FlowDetail, FlowListItem, FlowTemplate, Paginated, Queue, Extension, Trunk, UserDto, Tenant } from '../types/api.js';

type RecordItem = { id: string; [key: string]: unknown };
type Field = { key: string; label: string; kind?: 'number' | 'boolean' | 'password' | 'select' | 'list' | 'reference'; required?: boolean; options?: string[]; default?: unknown };
type Config = { title: string; endpoint: string; fields: Field[]; summary: string[]; tenantScoped?: boolean; paginated?: boolean };
const field = (key: string, label: string, kind?: Field['kind'], options?: string[], defaultValue?: unknown): Field => ({ key, label, kind, options, default: defaultValue });
const configs: Record<string, Config> = {
  tenants: { title: 'Empresas', endpoint: '/tenants', summary: ['name', 'slug', 'timezone', 'active'], fields: [field('name', 'Nome'), field('slug', 'Identificador'), field('timezone', 'Fuso horário', undefined, undefined, 'America/Sao_Paulo'), field('locale', 'Idioma', 'select', ['pt-BR', 'en', 'es'], 'pt-BR'), field('active', 'Ativa', 'boolean', undefined, true)] },
  users: { title: 'Usuários', endpoint: '/users', tenantScoped: true, paginated: true, summary: ['name', 'email', 'role', 'active'], fields: [field('name', 'Nome'), field('email', 'E-mail'), field('password', 'Senha (mínimo 6 caracteres)', 'password'), field('role', 'Perfil', 'select', ['tenant_admin', 'supervisor', 'agent'], 'agent'), field('extensionId', 'Ramal vinculado', 'reference'), field('locale', 'Idioma', 'select', ['pt-BR', 'en', 'es'], 'pt-BR'), field('active', 'Ativo', 'boolean', undefined, true)] },
  trunks: { title: 'Troncos VoIP', endpoint: '/trunks', tenantScoped: true, summary: ['name', 'host', 'authMode', 'active'], fields: [field('name', 'Identificador (minúsculas, sem espaços)'), field('host', 'Servidor SIP'), field('port', 'Porta SIP', 'number', undefined, 5060), field('authMode', 'Autenticação', 'select', ['register', 'ip'], 'register'), field('transport', 'Transporte', 'select', ['udp', 'tcp', 'tls'], 'udp'), field('username', 'Usuário SIP'), field('password', 'Senha SIP', 'password'), field('dids', 'DIDs (separados por vírgula)', 'list'), field('active', 'Ativo', 'boolean', undefined, true)] },
  extensions: { title: 'Ramais', endpoint: '/extensions', tenantScoped: true, summary: ['number', 'name', 'type', 'active'], fields: [field('number', 'Número'), field('name', 'Nome'), field('type', 'Tipo', 'select', ['sip', 'webrtc'], 'webrtc'), field('secret', 'Senha SIP (mínimo 6 caracteres)', 'password'), field('record', 'Gravar chamadas', 'boolean', undefined, false), field('active', 'Ativo', 'boolean', undefined, true)] },
  inbound: { title: 'Rotas de entrada', endpoint: '/inbound-routes', tenantScoped: true, summary: ['name', 'did', 'destinationType', 'active'], fields: [field('name', 'Nome'), field('did', 'DID / padrão', undefined, undefined, '_X.'), field('trunkId', 'Tronco (opcional)', 'reference'), field('destinationType', 'Destino', 'select', ['ivr', 'extension', 'queue'], 'ivr'), field('flowId', 'Fluxo (para URA)', 'reference'), field('extensionNumber', 'Ramal (para ramal)', 'reference'), field('queueName', 'Fila (para fila)', 'reference'), field('priority', 'Prioridade', 'number', undefined, 100), field('active', 'Ativa', 'boolean', undefined, true)] },
  outbound: { title: 'Rotas de saída', endpoint: '/outbound-routes', tenantScoped: true, summary: ['name', 'pattern', 'trunkId', 'active'], fields: [field('name', 'Nome'), field('pattern', 'Padrão (ex.: _9.)'), field('trunkId', 'Tronco', 'reference'), field('stripDigits', 'Remover dígitos', 'number', undefined, 0), field('prependDigits', 'Prefixar dígitos', undefined, undefined, ''), field('priority', 'Prioridade', 'number', undefined, 100), field('active', 'Ativa', 'boolean', undefined, true)] },
  queues: { title: 'Filas de atendimento', endpoint: '/queues', tenantScoped: true, summary: ['name', 'strategy', 'timeoutSec', 'active'], fields: [field('name', 'Nome'), field('description', 'Descrição'), field('strategy', 'Estratégia', 'select', ['rrmemory', 'ringall', 'leastrecent', 'fewestcalls', 'random', 'linear'], 'rrmemory'), field('timeoutSec', 'Tempo de toque (s)', 'number', undefined, 20), field('slaSec', 'SLA (s)', 'number', undefined, 60), field('record', 'Gravar chamadas', 'boolean', undefined, true), field('active', 'Ativa', 'boolean', undefined, true)] },
};
const display = (value: unknown) => typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : value == null || value === '' ? '—' : String(value);
const defaults = (fields: Field[]) => Object.fromEntries(fields.map((item) => [item.key, item.default ?? (item.kind === 'boolean' ? false : item.kind === 'number' ? 0 : '')]));

type TrunkStatusItem = { id: string; name: string; status: string; registered: boolean; detail?: string };
function trunkStatusLabel(st?: TrunkStatusItem): string {
  if (!st) return 'Verificando...';
  switch (st.status) {
    case 'registered': return 'Registrado';
    case 'unregistered': return 'Desconectado';
    case 'rejected': return 'Rejeitado';
    case 'unreachable': return 'Inacessível';
    case 'inactive': return 'Inativo';
    default: return 'Sem resposta';
  }
}
function StatusLight({ registered, label, detail }: { registered: boolean; label: string; detail?: string }) {
  return <span className="inline-flex items-center gap-2" title={detail}>
    <span className={`h-2.5 w-2.5 rounded-full ${registered ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
    <span className={registered ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>{label}</span>
  </span>;
}

export function ResourcePage({ resource }: { resource: keyof typeof configs }) {
  const config = configs[resource];
  const { t } = useTranslation();
  const tenantId = useEffectiveTenantId();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTenant();
  const [editing, setEditing] = useState<RecordItem | 'new' | null>(null);
  const [queueMembers, setQueueMembers] = useState<RecordItem | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['resource', resource], queryFn: () => get<RecordItem[]>(config.endpoint), enabled: !config.tenantScoped });
  const scoped = useTenantQuery(['resource', resource, page], () => get<RecordItem[] | Paginated<RecordItem>>(config.endpoint + (config.paginated ? `?pageSize=20&page=${page}` : '')), { enabled: !!config.tenantScoped });
  const needsRoutes = !!editing && (resource === 'inbound' || resource === 'outbound');
  const extensions = useTenantQuery(['resource', 'extensions'], () => get<Extension[]>('/extensions'), { enabled: !!editing && (resource === 'users' || resource === 'inbound') });
  const trunks = useTenantQuery(['resource', 'trunks'], () => get<Trunk[]>('/trunks'), { enabled: needsRoutes });
  const flows = useTenantQuery(['flows'], () => get<FlowListItem[]>('/flows'), { enabled: !!editing && resource === 'inbound' });
  const queues = useTenantQuery(['resource', 'queues'], () => get<Queue[]>('/queues'), { enabled: !!editing && resource === 'inbound' });
  const isTrunks = resource === 'trunks';
  const trunkStatuses = useTenantQuery(['trunk-statuses'], () => get<TrunkStatusItem[]>('/trunks/statuses'), { enabled: isTrunks, refetchInterval: 8000 });
  const referenceOptions: Record<string, { value: string; label: string }[]> = {
    extensionId: extensions.data?.map((item) => ({ value: item.id, label: `${item.number} · ${item.name}` })) ?? [],
    extensionNumber: extensions.data?.map((item) => ({ value: item.number, label: `${item.number} · ${item.name}` })) ?? [],
    trunkId: trunks.data?.map((item) => ({ value: item.id, label: item.name })) ?? [],
    flowId: flows.data?.map((item) => ({ value: item.id, label: item.name })) ?? [],
    queueName: queues.data?.map((item) => ({ value: item.name, label: item.name })) ?? [],
  };
  const result = config.tenantScoped ? scoped : query;
  const data = result.data;
  const rows = Array.isArray(data) ? data : data?.items ?? [];
  const canEdit = user?.role === 'superadmin' || user?.role === 'tenant_admin';
  const refresh = async () => { if (config.tenantScoped) await invalidate(['resource', resource]); else { await queryClient.invalidateQueries({ queryKey: ['resource', resource] }); await queryClient.invalidateQueries({ queryKey: ['tenants'] }); } if (isTrunks) await invalidate(['trunk-statuses']); };
  const open = (item: RecordItem | 'new') => { setEditing(item); setValues(item === 'new' ? defaults(config.fields) : Object.fromEntries(config.fields.map((f) => [f.key, item[f.key] ?? f.default ?? (f.kind === 'boolean' ? false : '')]))); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const body = Object.fromEntries(config.fields.filter((f) => !(f.kind === 'password' && !values[f.key])).map((f) => [f.key, f.kind === 'list' ? String(values[f.key] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : values[f.key]]));
      if (resource === 'inbound') {
        for (const key of ['trunkId', 'flowId', 'extensionNumber', 'queueName']) if (body[key] === '') body[key] = null;
      }
      if (resource === 'users' && editing === 'new' && !body.password) throw new Error('Informe uma senha para o usuário.');
      if (resource === 'users' && editing === 'new' && !body.extensionId) delete body.extensionId;
      if (resource === 'trunks' && editing !== 'new' && !body.password) delete body.password;
      if (editing === 'new') await post(config.endpoint, body);
      else if (editing) await patch(`${config.endpoint}/${editing.id}`, body);
      await refresh(); setEditing(null); toast.success('Registro salvo');
    } catch (error) { toast.error('Não foi possível salvar', getErrorMessage(error)); } finally { setBusy(false); }
  };
  const remove = async (item: RecordItem) => {
    if (!window.confirm(`Excluir ${display(item.name ?? item.number)}? Esta ação não pode ser desfeita.`)) return;
    try { await del(`${config.endpoint}/${item.id}`); await refresh(); toast.success('Registro excluído'); }
    catch (error) { toast.error('Não foi possível excluir', getErrorMessage(error)); }
  };
  return <div className="space-y-5">
    <PageHeader title={config.title} description="Gerencie os registros cadastrados" actions={canEdit && (!config.tenantScoped || tenantId) ? <Button onClick={() => open('new')}>Novo registro</Button> : undefined} />
    {config.tenantScoped && !tenantId && user?.role === 'superadmin' ? <Card>Selecione uma empresa no topo para continuar.</Card> : <Card padded={false}>
      {result.isLoading && <p className="p-5 text-slate-500">Carregando...</p>}
      {result.error && <p role="alert" className="p-5 text-red-700">{getErrorMessage(result.error)}</p>}
      {!result.isLoading && !result.error && (rows.length === 0 ? <p className="p-5 text-slate-500">Nenhum registro encontrado.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{config.summary.map((key) => <th className="px-4 py-3" key={key}>{config.fields.find((f) => f.key === key)?.label ?? key}</th>)}{isTrunks && <th className="px-4 py-3">Status</th>}<th className="px-4 py-3">Ações</th></tr></thead><tbody>{rows.map((item) => <tr className="border-t border-slate-100" key={item.id}>{config.summary.map((key) => <td key={key} className="px-4 py-3">{display(item[key])}</td>)}{isTrunks && (() => { const st = trunkStatuses.data?.find((s) => s.id === item.id); return <td className="px-4 py-3"><StatusLight registered={!!st?.registered} label={trunkStatusLabel(st)} detail={st?.detail} /></td>; })()}<td className="flex gap-2 px-4 py-2"><Button size="sm" variant="outline" onClick={() => open(item)}>{canEdit ? t('app.edit') : 'Ver'}</Button>{resource === 'queues' && <Button size="sm" variant="outline" onClick={() => setQueueMembers(item)}>Ramais</Button>}{canEdit && <Button size="sm" variant="danger" onClick={() => void remove(item)}>{t('app.delete')}</Button>}</td></tr>)}</tbody></table></div>)}
      {config.paginated && !result.isLoading && !result.error && !Array.isArray(data) && data && data.total > 0 && <div className="flex items-center justify-end gap-3 p-4 text-sm text-slate-600"><span>Página {page} de {Math.ceil(data.total / 20)} · {data.total} registros</span><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Próxima</Button></div>}
    </Card>}
    {queueMembers && <QueueMembers queue={queueMembers as unknown as { id: string; name: string; members: { extensionId: string; extension: { number: string; name: string } }[] }} close={() => setQueueMembers(null)} />}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-3" onClick={() => setEditing(null)}><div role="dialog" aria-label={config.title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}><h2 className="mb-4 text-lg font-bold text-brand-navy">{editing === 'new' ? 'Novo registro' : 'Detalhes'} · {config.title}</h2><form className="space-y-3" onSubmit={(event) => void save(event)}>{config.fields.map((f) => <label key={f.key} className="block text-sm font-medium text-slate-700">{f.kind === 'boolean' ? <span className="flex items-center gap-2"><input type="checkbox" checked={!!values[f.key]} disabled={!canEdit} onChange={(event) => setValues({ ...values, [f.key]: event.target.checked })} />{f.label}</span> : <>{f.label}{f.kind === 'select' || f.kind === 'reference' ? <select className="input mt-1" value={String(values[f.key] ?? '')} disabled={!canEdit} required={editing === 'new' && resource === 'outbound' && f.key === 'trunkId'} onChange={(event) => setValues({ ...values, [f.key]: event.target.value })}>{f.kind === 'reference' ? <><option value="">Selecione...</option>{referenceOptions[f.key]?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</> : f.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input className="input mt-1" type={f.kind === 'password' ? 'password' : f.kind === 'number' ? 'number' : 'text'} min={f.kind === 'number' ? 0 : undefined} value={f.kind === 'password' ? String(values[f.key] ?? '') : f.kind === 'list' ? Array.isArray(values[f.key]) ? (values[f.key] as string[]).join(', ') : String(values[f.key] ?? '') : String(values[f.key] ?? '')} disabled={!canEdit} required={editing === 'new' && (f.required || ['name', 'number', 'host', 'email', 'slug', 'pattern', 'trunkId'].includes(f.key) || (resource === 'users' && f.key === 'password'))} onChange={(event) => setValues({ ...values, [f.key]: f.kind === 'number' ? Number(event.target.value) : event.target.value })} />}</>}</label>)}<div className="flex justify-end gap-2 pt-3"><Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>{canEdit && <Button type="submit" loading={busy}>Salvar</Button>}</div></form></div></div>}
  </div>;
}

export function RoutesPage() {
  const [tab, setTab] = useState<'inbound' | 'outbound'>('inbound');
  return <div className="space-y-4"><div className="flex gap-2"><Button variant={tab === 'inbound' ? 'primary' : 'outline'} onClick={() => setTab('inbound')}>Entrada</Button><Button variant={tab === 'outbound' ? 'primary' : 'outline'} onClick={() => setTab('outbound')}>Saída</Button></div><ResourcePage key={tab} resource={tab} /></div>;
}

export function FlowsPage() {
  const tenantId = useEffectiveTenantId();
  const invalidate = useInvalidateTenant();
  const [editing, setEditing] = useState<FlowDetail | 'new' | null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const flows = useTenantQuery(['flows'], () => get<FlowListItem[]>('/flows'));
  const templates = useTenantQuery(['flows', 'templates'], () => get<FlowTemplate[]>('/flows/templates/all'));
  const open = async (item: FlowListItem) => { try { const detail = await get<FlowDetail>(`/flows/${item.id}`); setEditing(detail); setName(detail.name); setDraft(JSON.stringify(detail.draft, null, 2)); } catch (error) { toast.error('Erro ao carregar fluxo', getErrorMessage(error)); } };
  const create = () => { setEditing('new'); setName('Nova URA'); setDraft(JSON.stringify(templates.data?.[0]?.definition ?? {}, null, 2)); };
  const save = async (publish: boolean) => {
    setBusy(true);
    try {
      const definition = JSON.parse(draft) as Record<string, unknown>;
      const validation = await post<{ ok: boolean; issues: { path: string; message: string }[] }>('/flows/validate', { draft: definition });
      if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
      const item = editing === 'new' ? await post<FlowDetail>('/flows', { name, draft: definition }) : editing ? await put<FlowDetail>(`/flows/${editing.id}/draft`, { draft: definition }) : null;
      if (publish && item) await post(`/flows/${item.id}/publish`);
      await invalidate(['flows']); setEditing(null); toast.success(publish ? 'Fluxo publicado' : 'Rascunho salvo');
    } catch (error) { toast.error('Erro no fluxo', getErrorMessage(error)); } finally { setBusy(false); }
  };
  return <div className="space-y-5"><PageHeader title="Fluxos URA" description="Edite a definição JSON, valide e publique o fluxo" actions={tenantId && <Button onClick={create}>Novo fluxo</Button>} />{!tenantId ? <Card>Selecione uma empresa no topo para continuar.</Card> : <Card padded={false}>{flows.error && <p role="alert" className="p-4 text-red-700">{getErrorMessage(flows.error)}</p>}{flows.isLoading && <p className="p-4">Carregando...</p>}{flows.data?.length === 0 && <p className="p-4 text-slate-500">Nenhum fluxo cadastrado.</p>}{flows.data?.map((flow) => <div key={flow.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><strong className="text-brand-navy">{flow.name}</strong><p className="text-sm text-slate-500">Versão {flow.version} · {flow.hasPublished ? 'Publicado' : 'Rascunho'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void open(flow)}>Editar</Button><Button variant="danger" onClick={async () => { if (!window.confirm(`Excluir ${flow.name}?`)) return; try { await del(`/flows/${flow.id}`); await invalidate(['flows']); toast.success('Fluxo excluído'); } catch (error) { toast.error('Erro ao excluir', getErrorMessage(error)); } }}>Excluir</Button></div></div>)}</Card>}{editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-3" onClick={() => setEditing(null)}><div role="dialog" aria-label="Editar fluxo" className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6" onClick={(event) => event.stopPropagation()}><h2 className="mb-4 text-lg font-bold text-brand-navy">Editor do fluxo</h2><label className="label">Nome<input className="input mt-1" value={name} disabled={editing !== 'new'} onChange={(event) => setName(event.target.value)} required /></label><label className="label mt-4 block">Definição (JSON)<textarea className="input mt-1 min-h-[40vh] w-full font-mono text-xs" spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} /></label><div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button loading={busy} variant="outline" onClick={() => void save(false)}>Salvar rascunho</Button><Button loading={busy} onClick={() => void save(true)}>Validar e publicar</Button></div></div></div>}</div>;
}

export function IntegrationsPage() {
  const tenantId = useEffectiveTenantId();
  const speech = useTenantQuery(['integrations', 'speech'], () => get<{ asrProvider: string; ttsProvider: string; nluProvider: string; ttsVoice: string; language: string } | null>('/speech-config'));
  const [voice, setVoice] = useState('');
  const [busy, setBusy] = useState(false);
  const saveVoice = async () => { setBusy(true); try { await put('/speech-config', { ttsVoice: voice }); await speech.refetch(); toast.success('Voz atualizada'); } catch (error) { toast.error('Erro ao salvar voz', getErrorMessage(error)); } finally { setBusy(false); } };
  return <div className="space-y-5"><PageHeader title="Integrações" description="Conexões ERP, WhatsApp e serviços de voz" />{!tenantId ? <Card>Selecione uma empresa no topo para continuar.</Card> : <><IntegrationManager category="erp" /><IntegrationManager category="whatsapp" /><Card title="Voz e reconhecimento">{speech.error && <p role="alert" className="text-red-700">{getErrorMessage(speech.error)}</p>}<p className="mb-3 text-sm text-slate-600">ASR: {speech.data?.asrProvider ?? 'openai'} · TTS: {speech.data?.ttsProvider ?? 'openai'} · NLU: {speech.data?.nluProvider ?? 'openai'}</p><label className="label block">Voz TTS<input className="input mt-1" value={voice || speech.data?.ttsVoice || ''} onChange={(event) => setVoice(event.target.value)} /></label><Button className="mt-3" loading={busy} onClick={() => void saveVoice()}>Salvar voz</Button></Card><p className="text-sm text-slate-500">Conexões são armazenadas com credenciais criptografadas. O teste de conexão e o envio real dependem da implementação dos adaptadores de telefonia e mensageria.</p></>}</div>;
}
