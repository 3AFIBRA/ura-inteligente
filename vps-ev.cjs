const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`
cd /opt/ura-inteligente
source .env 2>/dev/null || true
docker compose exec -T postgres psql -U "\${POSTGRES_USER:-ura}" -d "\${POSTGRES_DB:-ura}" -t -c "select e.type, e.data::text, to_char(e.\"createdAt\", 'HH24:MI:SS') from \"CallEvent\" e where e.\"createdAt\" > '2026-10-23 08:50:00' order by e.\"createdAt\" asc limit 25"
`, (err, stream) => {
    if (err) { console.error('EXEC ERR', err); c.end(); return; }
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
    stream.on('close', (code) => { console.log('\nEXIT', code); c.end(); });
  });
}).connect({ host: '195.35.42.220', username: 'root', password: '@NTvv040785@', readyTimeout: 30000 });
c.on('error', (e) => console.error('SSH ERR', e.message));
