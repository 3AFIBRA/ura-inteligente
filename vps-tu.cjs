const { Client } = require('ssh2');
const fs = require('fs');
const c = new Client();
const local = '/workspace/URA INTELIGENTE/.verdent/uploads/chamada-81993641925-2026-10-23 (1).mp3';
c.on('ready', () => {
  c.sftp((err, sftp) => {
    if (err) { console.error('SFTP ERR', err); c.end(); return; }
    let done = 0;
    const next = () => { if (++done === 2) c.exec('cd /opt/ura-inteligente && docker compose cp /tmp/transcribe-user.js engine:/app/transcribe-user.js && docker compose cp /tmp/chamada-usuario.mp3 engine:/tmp/chamada-usuario.mp3 && docker compose exec -T engine node /app/transcribe-user.js', (e3, stream) => {
      if (e3) { console.error('EXEC ERR', e3); c.end(); return; }
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (code) => { console.log('\nEXIT', code); c.end(); });
    }); };
    sftp.fastPut('/tmp/transcribe-user.js', '/tmp/transcribe-user.js', next);
    sftp.fastPut(local, '/tmp/chamada-usuario.mp3', next);
  });
}).connect({ host: '195.35.42.220', username: 'root', password: '@NTvv040785@', readyTimeout: 30000 });
c.on('error', (e) => console.error('SSH ERR', e.message));
