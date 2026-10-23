import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Manager from 'asterisk-manager';
import type { AmiManager } from 'asterisk-manager';
import { env } from '../config/env.js';

export type AmiEvent = Record<string, string | string[] | undefined>;

function evtStr(evt: AmiEvent, key: string): string {
  const v = evt[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

@Injectable()
export class AmiService implements OnModuleDestroy {
  private readonly logger = new Logger(AmiService.name);
  private manager: AmiManager | null = null;
  private readonly eventListeners = new Set<(evt: AmiEvent) => void>();

  private ensureManager(): AmiManager {
    if (this.manager?.isConnected()) return this.manager;
    if (this.manager) {
      try { this.manager.disconnect(); } catch { /* noop */ }
    }
    const manager = Manager(env.amiPort, env.amiHost, env.amiUser, env.amiPassword, true) as AmiManager;
    manager.on('managerevent', (evt: AmiEvent) => {
      for (const fn of [...this.eventListeners]) {
        try { fn(evt); } catch { /* noop */ }
      }
    });
    manager.keepConnected();
    this.manager = manager;
    return manager;
  }

  onModuleDestroy() {
    if (this.manager) {
      try { this.manager.disconnect(); } catch { /* noop */ }
      this.manager = null;
    }
  }

  /** Executa uma ação AMI e aguarda a resposta. */
  action(payload: Record<string, unknown>, timeoutMs = 8000): Promise<AmiEvent> {
    const manager = this.ensureManager();
    const actionId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`AMI sem resposta para ${String(payload.Action)}`)), timeoutMs);
      manager.action({ ...payload, actionid: actionId }, (err, res) => {
        clearTimeout(timer);
        if (err) reject(new Error(`Erro AMI em ${String(payload.Action)}`));
        else resolve(res as AmiEvent);
      });
    });
  }

  /**
   * Executa uma ação AMI que retorna uma lista de eventos (ex.: PJSIPShow*)
   * e coleta todos os eventos até EventListComplete (ou timeout).
   */
  actionWithEvents(payload: Record<string, unknown>, timeoutMs = 8000): Promise<AmiEvent[]> {
    const manager = this.ensureManager();
    const actionId = randomUUID();
    return new Promise((resolve) => {
      const events: AmiEvent[] = [];
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.eventListeners.delete(handler);
        resolve(events);
      };
      const handler = (evt: AmiEvent) => {
        if (evtStr(evt, 'actionid') && evtStr(evt, 'actionid') !== actionId) return;
        const name = evtStr(evt, 'event');
        if (name === 'EventListComplete' || /Complete$/.test(name)) {
          finish();
          return;
        }
        if (name) events.push(evt);
      };
      const timer = setTimeout(finish, timeoutMs);
      this.eventListeners.add(handler);
      manager.action({ ...payload, actionid: actionId }, (err) => {
        if (err) finish();
      });
    });
  }

  async reloadPjsip() {
    await this.action({ Action: 'Command', Command: 'module reload res_pjsip.so' });
    // recarrega tambem os objetos identify (res_pjsip_endpoint_identifier_ip)
    await this.action({ Action: 'Command', Command: 'module reload res_pjsip_endpoint_identifier_ip.so' }).catch(() => undefined);
  }

  async reloadDialplan() {
    await this.action({ Action: 'Command', Command: 'dialplan reload' });
  }

  /** Status dos registros de saída (troncos com autenticação register). Mapa objectName -> status. */
  async outboundRegistrations(): Promise<Map<string, string>> {
    const events = await this.actionWithEvents({ Action: 'PJSIPShowRegistrationsOutbound' });
    const map = new Map<string, string>();
    for (const evt of events) {
      if (evtStr(evt, 'event') !== 'OutboundRegistrationDetail') continue;
      const objectName = evtStr(evt, 'objectname') || evtStr(evt, 'registration');
      const status = evtStr(evt, 'status');
      if (objectName) map.set(objectName, status);
    }
    return map;
  }

  /** Status dos contatos de um endpoint (troncos IP). Retorna lista de status de contato. */
  async endpointContactStatuses(endpoint: string): Promise<string[]> {
    const events = await this.actionWithEvents({ Action: 'PJSIPShowEndpoint', Endpoint: endpoint });
    const statuses: string[] = [];
    for (const evt of events) {
      if (evtStr(evt, 'event') !== 'ContactStatusDetail') continue;
      const status = evtStr(evt, 'status');
      if (status) statuses.push(status);
    }
    return statuses;
  }
}
