import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Clock, Download, Phone, Radio, UserRound } from 'lucide-react';
import { Card, StatCard } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Table } from '../components/ui/Table.js';
import { get, patch, buildQuery, getErrorMessage, api, recordingStreamUrl } from '../lib/api.js';
import { useTenantQuery, useEffectiveTenantId } from '../hooks/useTenantQuery.js';
import { useAuthStore } from '../store/auth.js';
import { toast } from '../store/toast.js';
import type { CallDetail, Paginated, ReportOverview, Queue, UserDto } from '../types/api.js';

const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');
const formatDuration = (seconds?: number | null) => seconds == null ? '—' : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
const statuses: Record<string, string> = { ringing: 'Tocando', in_ivr: 'Na URA', in_queue: 'Na fila', talking: 'Em conversa', completed: 'Concluída', abandoned: 'Abandonada', failed: 'Falhou' };
const statusLabel = (status: string) => statuses[status] ?? status;
const directions: Record<string, string> = { inbound: 'Entrada', outbound: 'Saída', internal: 'Interna' };

/** Baixa a gravacao da chamada em MP3. */
async function downloadRecordingMp3(call: CallDetail) {
  if (!call.recordingId) return;
  try {
    const res = await api.get(`/recordings/${call.recordingId}/download.mp3`, { responseType: 'blob', timeout: 120000 });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chamada-${call.callerId || call.id.slice(0, 8)}-${new Date(call.startedAt).toISOString().slice(0, 10)}.mp3`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error('Não foi possível baixar a gravação', getErrorMessage(error));
  }
}

function TenantRequired({ children }: { children: React.ReactNode }) {
  const tenantId = useEffectiveTenantId();
  return tenantId ? <>{children}</> : <div className="card p-8 text-center text-slate-600">Selecione uma empresa no topo para visualizar os dados.</div>;
}

function ErrorNotice({ error }: { error: unknown }) {
  return error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar os dados: {getErrorMessage(error)}</div> : null;
}

export function CallsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useTenantQuery(['calls', 'list', page, status, direction], () => get<Paginated<CallDetail>>(`/calls${buildQuery({ page, pageSize: 20, status, direction })}`));
  const detail = useTenantQuery(['calls', 'detail', selectedId], () => get<CallDetail>(`/calls/${selectedId}`), { enabled: !!selectedId });
  return <TenantRequired><div className="space-y-5">
    <PageHeader title={t('calls.title')} description="Histórico de chamadas da empresa" />
    <div className="flex flex-wrap gap-3">
      <select aria-label="Filtrar por status" className="input w-auto" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="">Todos os status</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select aria-label="Filtrar por direção" className="input w-auto" value={direction} onChange={(event) => { setDirection(event.target.value); setPage(1); }}>
        <option value="">Todas as direções</option>{Object.entries(directions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Button variant="outline" onClick={() => void list.refetch()}>Atualizar</Button>
    </div>
    <ErrorNotice error={list.error} />
    <Card padded={false}><Table rows={list.data?.items} loading={list.isLoading} rowKey={(call) => call.id} onRowClick={(call) => setSelectedId(call.id)} emptyTitle="Nenhuma chamada encontrada" columns={[
      { key: 'date', header: 'Data', render: (call) => formatDate(call.startedAt) },
      { key: 'from', header: 'Origem', render: (call) => call.callerId || '—' },
      { key: 'to', header: 'Destino', render: (call) => call.destination || call.did || '—' },
      { key: 'direction', header: 'Direção', render: (call) => directions[call.direction] ?? call.direction },
      { key: 'status', header: 'Status', render: (call) => statusLabel(call.status) },
      { key: 'duration', header: 'Duração', render: (call) => formatDuration(call.durationSec) },
      { key: 'recording', header: 'Gravação', render: (call) => call.recordingId
        ? <Button variant="outline" onClick={(event) => { event.stopPropagation(); void downloadRecordingMp3(call); }} title="Baixar gravação em MP3"><Download size={14} /> MP3</Button>
        : <span className="text-slate-400">—</span> },
    ]} /></Card>
    {(list.data?.total ?? 0) > 0 && <div className="flex items-center justify-end gap-3 text-sm text-slate-600"><span>Página {page} de {Math.ceil((list.data?.total ?? 0) / 20)} · {list.data?.total} chamadas</span><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" disabled={page * 20 >= (list.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Próxima</Button></div>}
    {selectedId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4" onClick={() => setSelectedId(null)}><div role="dialog" aria-label="Detalhes da chamada" className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-brand-navy">Detalhes da chamada</h3><Button variant="outline" onClick={() => setSelectedId(null)}>Fechar</Button></div>
      <ErrorNotice error={detail.error} />{detail.isLoading ? <p>Carregando...</p> : detail.data && <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">{([['Início', formatDate(detail.data.startedAt)], ['Origem', detail.data.callerId], ['Destino', detail.data.destination || detail.data.did || '—'], ['Status', statusLabel(detail.data.status)], ['Fila', detail.data.queueName || '—'], ['Atendente', detail.data.agentExtension || '—'], ['Duração', formatDuration(detail.data.durationSec)], ['Cliente', detail.data.customerName || '—']] as const).map(([label, value]) => <div key={label}><span className="block text-xs text-slate-500">{label}</span><strong className="text-brand-navy">{value}</strong></div>)}</div>
        {detail.data.recordingId && <div className="rounded-lg border border-slate-200 p-3"><h4 className="mb-2 font-semibold">Gravação</h4><div className="flex flex-wrap items-center gap-3"><audio controls preload="none" src={recordingStreamUrl(detail.data.recordingId)} className="h-9 min-w-0 flex-1" /><Button variant="outline" onClick={() => void downloadRecordingMp3(detail.data)}><Download size={14} /> Baixar MP3</Button></div></div>}
        {detail.data.events.length > 0 && <div><h4 className="mb-2 font-semibold">Eventos</h4><ol className="space-y-2 border-l-2 border-accent-200 pl-3">{detail.data.events.map((event) => <li key={event.id}>{formatDate(event.createdAt)} · {event.type}</li>)}</ol></div>}
      </div>}
    </div></div>}
  </div></TenantRequired>;
}

export function SupervisionPage() {
  const { t } = useTranslation();
  const active = useTenantQuery(['calls', 'active'], () => get<CallDetail[]>('/calls/active/all'), { refetchInterval: 10000 });
  const queues = useTenantQuery(['queues', 'list'], () => get<Queue[]>('/queues'), { refetchInterval: 30000 });
  return <TenantRequired><div className="space-y-5"><PageHeader title={t('supervision.title')} description="Acompanhamento das chamadas a cada 10 segundos" actions={<Button variant="outline" onClick={() => { void active.refetch(); void queues.refetch(); }}>Atualizar agora</Button>} />
    <ErrorNotice error={active.error || queues.error} />
    <div className="grid gap-4 sm:grid-cols-2"><StatCard label="Chamadas ativas" value={active.data?.length ?? '—'} icon={<Radio size={20} />} tone="primary" /><StatCard label="Filas cadastradas" value={queues.data?.length ?? '—'} icon={<Phone size={20} />} tone="accent" /></div>
    <Card title="Chamadas em andamento"><Table rows={active.data} loading={active.isLoading} rowKey={(call) => call.id} emptyTitle="Nenhuma chamada ativa" columns={[
      { key: 'from', header: 'Origem', render: (call) => call.callerId }, { key: 'status', header: 'Etapa', render: (call) => statusLabel(call.status) }, { key: 'queue', header: 'Fila', render: (call) => call.queueName || '—' }, { key: 'agent', header: 'Ramal', render: (call) => call.agentExtension || '—' }, { key: 'since', header: 'Início', render: (call) => formatDate(call.startedAt) },
    ]} /></Card>
    <Card title="Filas configuradas"><Table rows={queues.data} loading={queues.isLoading} rowKey={(queue) => queue.id} emptyTitle="Nenhuma fila cadastrada" columns={[
      { key: 'name', header: 'Nome', render: (queue) => queue.name }, { key: 'members', header: 'Membros', render: (queue) => queue.members?.length ?? 0 }, { key: 'active', header: 'Situação', render: (queue) => queue.active ? 'Ativa' : 'Inativa' },
    ]} /></Card>
  </div></TenantRequired>;
}

export function ReportsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useTenantQuery(['reports', 'overview', from, to], () => get<ReportOverview>(`/reports/overview${buildQuery({ from, to })}`));
  const exportCsv = async () => {
    try {
      const result = await get<Paginated<CallDetail>>(`/calls${buildQuery({ from, to, pageSize: 100 })}`);
      const rows = [...result.items];
      for (let page = 2; rows.length < result.total; page++) {
        const next = await get<Paginated<CallDetail>>(`/calls${buildQuery({ from, to, pageSize: 100, page })}`);
        if (next.items.length === 0) throw new Error('A exportação foi interrompida: a API não retornou a próxima página de chamadas.');
        rows.push(...next.items);
      }
      const csv = [['Data', 'Origem', 'Destino', 'Direção', 'Status', 'Duração (s)'], ...rows.map((call) => [call.startedAt, call.callerId, call.destination || call.did || '', call.direction, call.status, String(call.durationSec ?? '')])].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'chamadas.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error('Erro ao exportar chamadas', getErrorMessage(error)); }
  };
  return <TenantRequired><div className="space-y-5"><PageHeader title={t('nav.reports')} description="Indicadores calculados com base nas chamadas registradas" actions={<Button variant="outline" onClick={() => void exportCsv()}><Download size={16} /> Exportar CSV</Button>} />
    <div className="flex flex-wrap items-end gap-3"><label className="label">De <input className="input mt-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="label">Até <input className="input mt-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><Button variant="outline" onClick={() => { setFrom(''); setTo(''); }}>Limpar filtros</Button></div>
    <ErrorNotice error={report.error} />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Chamadas" value={report.data?.totalCalls ?? '—'} icon={<Phone size={20} />} tone="primary" /><StatCard label="Atendidas" value={report.data?.answered ?? '—'} icon={<UserRound size={20} />} tone="accent" /><StatCard label="Abandonadas" value={report.data?.abandoned ?? '—'} icon={<BarChart3 size={20} />} tone="danger" /><StatCard label="Espera média" value={report.data ? formatDuration(report.data.avgWaitSec) : '—'} icon={<Clock size={20} />} /></div>
    <Card title="Chamadas por dia"><Table rows={report.data?.byDay} loading={report.isLoading} rowKey={(day) => day.date} emptyTitle="Nenhuma chamada no período" columns={[{ key: 'date', header: 'Data', render: (day) => day.date.split('-').reverse().join('/') }, { key: 'calls', header: 'Total', render: (day) => day.calls }, { key: 'answered', header: 'Atendidas', render: (day) => day.answered }, { key: 'abandoned', header: 'Abandonadas', render: (day) => day.abandoned }]} /></Card>
    <Card title="Desempenho das filas"><Table rows={report.data?.byQueue} loading={report.isLoading} rowKey={(queue) => queue.queueName} emptyTitle="Sem registros de fila" columns={[{ key: 'name', header: 'Fila', render: (queue) => queue.queueName }, { key: 'calls', header: 'Chamadas', render: (queue) => queue.calls }, { key: 'answered', header: 'Atendidas', render: (queue) => queue.answered }, { key: 'wait', header: 'Espera média', render: (queue) => formatDuration(queue.avgWaitSec) }]} /></Card>
  </div></TenantRequired>;
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [locale, setLocale] = useState(user?.locale || i18n.language);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const updated = await patch<UserDto>('/auth/me', { name, locale, ...(password ? { password, currentPassword } : {}) });
      setUser(updated); await i18n.changeLanguage(locale); setPassword(''); setCurrentPassword(''); toast.success('Perfil atualizado');
    } catch (error) { toast.error('Não foi possível salvar', getErrorMessage(error)); }
    finally { setSaving(false); }
  };
  return <div className="max-w-2xl space-y-5"><PageHeader title={t('nav.settings')} description="Preferências e segurança da sua conta" />
    <Card title="Meu perfil"><form className="space-y-4" onSubmit={(event) => void save(event)}>
      <div><label className="label" htmlFor="profile-name">Nome</label><input id="profile-name" className="input" value={name} onChange={(event) => setName(event.target.value)} required /></div>
      <div><label className="label" htmlFor="profile-email">E-mail</label><input id="profile-email" className="input" value={user?.email ?? ''} readOnly /></div>
      <div><label className="label" htmlFor="profile-locale">Idioma</label><select id="profile-locale" className="input" value={locale} onChange={(event) => setLocale(event.target.value)}><option value="pt-BR">Português</option><option value="en">English</option><option value="es">Español</option></select></div>
      <div className="border-t border-slate-100 pt-4"><h4 className="mb-3 font-semibold text-brand-navy">Alterar senha</h4><div className="space-y-3"><div><label htmlFor="profile-current" className="label">Senha atual</label><input id="profile-current" type="password" className="input" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required={!!password} autoComplete="current-password" /></div><div><label htmlFor="profile-password" className="label">Nova senha (mínimo de 8 caracteres)</label><input id="profile-password" type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" /></div></div></div>
      <Button type="submit" loading={saving}>Salvar alterações</Button>
    </form></Card>
  </div>;
}
