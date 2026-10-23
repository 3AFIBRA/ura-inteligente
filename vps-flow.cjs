const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`cd /opt/ura-inteligente && docker compose exec -T engine node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const flow = await p.ivrFlow.findFirst({ where: { tenantId: "42fff3f7-5234-4f94-ab75-e9bb73f0b2a7", published: true }, orderBy: { updatedAt: "desc" } });
  const def = flow.definition;
  console.log("start:", def.start);
  for (const n of def.nodes) {
    if (["menu","erp_action","ask","playback","say","whatsapp_send"].includes(n.type))
      console.log(JSON.stringify({ id: n.id, type: n.type, ...(n.type==="menu"?{options:n.options,intents:n.intents}:{}) , ...(n.type==="erp_action"?{action:n.action,onSuccess:n.onSuccess,onFailure:n.onFailure}:{}) , ...(n.prompt?{prompt:(n.prompt.text||"").slice(0,80)}:{}) }));
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
