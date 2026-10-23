const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.exec(`
cd /opt/ura-inteligente
source .env 2>/dev/null || true
echo '=== chamada 81993641925 ==='
docker compose exec -T postgres psql -U "\${POSTGRES_USER:-ura}" -d "\${POSTGRES_DB:-ura}" -t -c 'select c."channelId", c.status, to_char(c."startedAt", '"'"'HH24:MI:SS'"'"') from "Call" c where c."callerId" like '%81993641925%' order by c."startedAt" desc limit 3'
echo '=== eventos ==='
docker compose exec -T postgres psql -U "\${POSTGRES_USER:-ura}" -d "\${POSTGRES_DB:-ura}" -t -c 'select e.type, e.data::text, to_char(e."createdAt", '"'"'HH24:MI:SS'"'"') from "CallEvent" e join "Call" c on c.id=e."callId" where c."callerId" like '%81993641925%' order by e."createdAt" asc limit 20'
echo '=== gravacoes snoop dessa chamada ==='
docker compose exec -T asterisk sh -c 'ls -la /var/spool/asterisk/recording/ | grep "m-17" | tail -6'
echo '=== log asterisk RTP da chamada ==='
docker compose logs asterisk --since 3h 2>&1 | grep -iE '81993641925|rtp.*learn|strict' | tail -10
`, (err, stream) => {
    if (err) { console.error('EXEC ERR', err); c.end(); return; }
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
    stream.on('close', (code) => { console.log('\nEXIT', code); c.end(); });
  });
}).connect({ host: '195.35.42.220', username: 'root', password: '@NTvv040785@', readyTimeout: 30000 });
c.on('error', (e) => console.error('SSH ERR', e.message));
