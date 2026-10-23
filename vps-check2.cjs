const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`cd /opt/ura-inteligente && docker compose exec -T engine node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const erp = await p.erpConnection.findMany({ where: { tenantId: "42fff3f7-5234-4f94-ab75-e9bb73f0b2a7" } });
  console.log("ERP:", erp.length, erp.map(e => e.provider + "/" + (e.active ? "ativo" : "inativo")));
  const wa = await p.whatsappConnection.findMany({ where: { tenantId: "42fff3f7-5234-4f94-ab75-e9bb73f0b2a7" } });
  console.log("WhatsApp:", wa.length, wa.map(w => w.provider + "/" + (w.active ? "ativo" : "inativo")));
  const flow = await p.ivrFlow.findFirst({ where: { tenantId: "42fff3f7-5234-4f94-ab75-e9bb73f0b2a7", active: true } });
  const def = typeof flow.published === "string" ? JSON.parse(flow.published) : flow.published;
  const sv = def.nodes.find(n => n.id === "sv_verifica_cliente");
  console.log("sv_verifica_cliente:", JSON.stringify(sv));
  const ident = def.nodes.find(n => n.id === "ident_callerid");
  console.log("ident_callerid:", JSON.stringify(ident));
  await p.\$disconnect();
})();
'`, (err, stream) => {
    if (err) { console.error('EXEC ERR', err); c.end(); return; }
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
    stream.on('close', (code) => { console.log('\nEXIT', code); c.end(); });
  });
}).connect({ host: '195.35.42.220', username: 'root', password: '@NTvv040785@', readyTimeout: 30000 });
c.on('error', (e) => console.error('SSH ERR', e.message));
