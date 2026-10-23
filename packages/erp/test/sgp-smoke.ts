// Smoke test do SgpApiConnector contra um servidor HTTP mockado
import { createServer } from 'node:http';
import { SgpApiConnector } from '../dist/connectors/sgp.js';

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const form = new URLSearchParams(body);
    const token = form.get('token');
    const respond = (data: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
    if (token !== 'TOKEN-OK') { respond({ status: 0, msg: 'Token invalido ou nao encontrado' }); return; }
    if (req.url === '/api/ura/consultacliente/') {
      const doc = form.get('cpfcnpj');
      const tel = form.get('telefone');
      if (doc === '12345678900' || tel) {
        respond({
          status: 1,
          contratos: [{
            clienteId: '77', contratoId: '300', razaoSocial: 'Joao da Silva', cpfCnpj: '12345678900',
            telefone: '81999998888', celular: '81988887777', email: 'joao@x.com', status: 'Ativo',
            planoNome: '500MB', endereco_logradouro: 'Rua A', endereco_numero: '10', endereco_bairro: 'Centro', endereco_cidade: 'Recife', endereco_uf: 'PE',
          }],
        });
      } else respond({ status: 0, msg: 'Cliente nao encontrado' });
      return;
    }
    if (req.url === '/api/ura/fatura2via/') {
      respond({ status: 1, links: [{ fatura: '99', vencimento: '2026-10-30', valor: 149.9, linhadigitavel: "12345678901234567890123456789012345678901234", codigopix: "00020126BR.GOV.BCB.PIX", link: "https://sgp.exemplo/boleto/99" }] });
      return;
    }
    if (req.url === '/api/ura/chamado/') { respond({ status: 1, protocolo: 'PROTO-1' }); return; }
    if (req.url === '/api/ura/liberacaopromessa/') { respond({ status: 1, msg: 'Liberado' }); return; }
    if (req.url === '/api/precadastro/F/') { respond({ status: 1, id: '500' }); return; }
    respond({ status: 0, msg: 'endpoint desconhecido' });
  });
});

await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const conn = new SgpApiConnector({
  type: 'sgp', mode: 'api',
  config: { baseUrl: `http://127.0.0.1:${port}` },
  secrets: { token: 'TOKEN-OK' },
  timeoutMs: 5000,
});

const t = await conn.testConnection();
console.log('testConnection:', t.ok, t.message);

const byDoc = await conn.findCustomerByDocument('123.456.789-00');
console.log('findCustomerByDocument:', byDoc?.name, byDoc?.id, byDoc?.contracts?.[0]?.id);

const byPhone = await conn.findCustomerByPhone('81999998888');
console.log('findCustomerByPhone:', byPhone?.name);

const invoices = await conn.listOpenInvoices(byDoc!.id);
console.log('listOpenInvoices:', invoices.length, invoices[0]?.id, invoices[0]?.amount, invoices[0]?.digitableLine?.slice(0, 10), 'pix:', !!invoices[0]?.pixCode);

const pdf = await conn.getInvoicePdf('99');
console.log('getInvoicePdf (url):', pdf.url);

const ticket = await conn.openTicket(byDoc!.id, 'Sem internet', 'Cliente sem conexao desde ontem');
console.log('openTicket:', ticket.id);

const unlock = await conn.unlockConnection(byDoc!.id);
console.log('unlockConnection:', unlock.ok, unlock.message);

const created = await conn.createCustomer({ name: 'Maria', document: '98765432100', phone: '81912345678' });
console.log('createCustomer:', created.id, created.name);

// auth error path
const bad = new SgpApiConnector({ type: 'sgp', mode: 'api', config: { baseUrl: `http://127.0.0.1:${port}` }, secrets: { token: 'ERRADO' }, timeoutMs: 5000 });
const badTest = await bad.testConnection();
console.log('token errado ->', badTest.ok, badTest.message);

server.close();
console.log('SMOKE OK');
