import { describe, expect, it } from 'vitest';
import { DEFAULT_ISP_FLOW } from '../src/default-flow.js';
import { interpolate, ivrFlowDefinitionSchema } from '../src/ivr-flow.js';
import { isValidCpf, isValidCnpj, normalizePhoneBR } from '../src/types.js';

describe('ivr flow schema', () => {
  it('valida o fluxo padrao', () => {
    const r = ivrFlowDefinitionSchema.safeParse(DEFAULT_ISP_FLOW);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues, null, 2)).toBe(true);
  });

  it('rejeita destino inexistente', () => {
    const r = ivrFlowDefinitionSchema.safeParse({
      nodes: [
        { id: 'start', type: 'start', next: 'nao_existe' },
        { id: 'fim', type: 'hangup' },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('interpola variaveis aninhadas', () => {
    expect(interpolate('Ola {{customer.name}} {{x}}', { customer: { name: 'Ana' } })).toBe('Ola Ana ');
  });
});

describe('validadores', () => {
  it('cpf/cnpj', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });
  it('telefone', () => {
    expect(normalizePhoneBR('(11) 98888-7777')).toBe('5511988887777');
    expect(normalizePhoneBR('05511988887777')).toBe('5511988887777');
  });
});
