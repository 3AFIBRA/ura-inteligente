const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`cd /opt/ura-inteligente && docker compose exec -T engine node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const flow = await p.ivrFlow.findFirst({ where: { tenantId: "42fff3f7-5234-4f94-ab75-e9bb73f0b2a7" }, orderBy: { updatedAt: "desc" } });
  const def = typeof flow.definition === "string" ? JSON.parse(flow.definition) : flow.definition;
  console.log("nome:", flow.name, "| start:", def.start);
  for (const n of def.nodes) {
    const info = { id: n.id, type: n.type };
    if (n.type === "menu") { info.options = n.options; info.intents = n.intents; }
    if (n.type === "erp_action") { info.action = n.action; info.onSuccess = n.onSuccess; info.onFailure = n.onFailure; }
    if (n.prompt && n.prompt.text) info.prompt = n.prompt.text.slice(0, 70);
    if (n.type === "whatsapp_send") { info.to = n.to; }
    console.log(JSON.stringify(info));
  }
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
