const { Client } = require('ssh2');
const fs = require('fs');
const c = new Client();
c.on('ready', () => {
  c.sftp((err, sftp) => {
    if (err) { console.error('SFTP ERR', err); c.end(); return; }
    sftp.fastPut('/tmp/dumpflow.js', '/tmp/dumpflow.js', () => {
      c.exec('cd /opt/ura-inteligente && docker compose cp /tmp/dumpflow.js engine:/app/dumpflow.js && docker compose exec -T engine node /app/dumpflow.js', (e3, stream) => {
        if (e3) { console.error('EXEC ERR', e3); c.end(); return; }
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
        stream.on('close', (code) => { console.log('\nEXIT', code); c.end(); });
      });
    });
  });
}).connect({ host: '195.35.42.220', username: 'root', password: '@NTvv040785@', readyTimeout: 30000 });
c.on('error', (e) => console.error('SSH ERR', e.message));
