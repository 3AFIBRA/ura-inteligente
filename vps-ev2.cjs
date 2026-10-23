const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`cd /opt/ura-inteligente && docker compose exec -T engine node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const evs = await p.callEvent.findMany({ where: { createdAt: { gt: new Date("2026-10-23T08:50:00Z") } }, orderBy: { createdAt: "asc" }, take: 25 });
  for (const e of evs) console.log(e.createdAt.toISOString().slice(11,19), e.type, JSON.stringify(e.data));
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
