const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`cd /opt/ura-inteligente && docker compose exec -T engine node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const flow = await p.ivrFlow.findFirst({ where: { tenantId: "42fff3f7-5234-4f94-ab75-e9bb73f0b2a7" }, orderBy: { updatedAt: "desc" } });
  console.log("chaves:", Object.keys(flow));
  console.log("definition tipo:", typeof flow.definition);
  const def = typeof flow.definition === "string" ? JSON.parse(flow.definition) : flow.definition;
  console.log("def chaves:", def ? Object.keys(def) : "null");
  const nodes = def.nodes || def;
  console.log("start:", def.start || def.startNode);
  const arr = Array.isArray(nodes) ? nodes : [];
  for (const n of arr) {
    const info = { id: n.id, type: n.type };
    if (n.type === "menu") { info.options = n.options; info.intents = n.intents; }
    if (n.type === "erp_action") { info.action = n.action; info.onSuccess = n.onSuccess; info.onFailure = n.onFailure; }
    if (n.prompt && n.prompt.text) info.prompt = n.prompt.text.slice(0, 70);
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
