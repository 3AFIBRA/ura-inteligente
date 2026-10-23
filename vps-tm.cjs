const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
  c.sftp((err, sftp) => {
    if (err) { console.error('SFTP ERR', err); c.end(); return; }
    sftp.fastPut('/tmp/transcribe-many.js', '/tmp/transcribe-many.js', () => {
      c.exec(`cd /opt/ura-inteligente && docker compose cp /tmp/transcribe-many.js engine:/app/transcribe-many.js && docker compose exec -T engine node /app/transcribe-many.js /var/spool/asterisk/recording/m-1792756338.4-1792756351707-zrdy.wav /var/spool/asterisk/recording/m-1792756845.5-1792756854393-ozyu.wav`, (e3, stream) => {
        if (e3) { console.error('EXEC ERR', e3); c.end(); return; }
        stream.on('data', (d) => process.stdout.write(d));
        stream.stderr.on('data', (d) => process.stderr.write(d));
        stream.on('close', (code) => { console.log('\nEXIT', code); c.end(); });
      });
    });
  });
}).connect({ host: '195.35.42.220', username: 'root', password: '@NTvv040785@', readyTimeout: 30000 });
c.on('error', (e) => console.error('SSH ERR', e.message));
