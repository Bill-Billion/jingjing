// lt_start.js - localtunnel启动脚本，固定子域名+自动重连
const localtunnel = require('localtunnel');
const fs = require('fs');
const http = require('http');

const URL_FILE = 'C:\\Android\\tunnel_url.txt';
const PORT = 3000;
const SUBDOMAIN = 'jjsr8x2k9m2026';
let currentUrl = '';
let pingTimer = null;

function writeStatus(msg) {
  try { fs.writeFileSync(URL_FILE, msg + '\n', 'utf8'); } catch(e) {}
}

function startPing(url) {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    const req = http.get('http://127.0.0.1:' + PORT + '/api/health', (res) => {
      res.resume();
    });
    req.on('error', () => {});
    req.setTimeout(5000, () => req.destroy());
  }, 30000);
}

async function connect() {
  try {
    const tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });
    currentUrl = tunnel.url;
    const msg = `TUNNEL_URL=${tunnel.url}\nTIME=${new Date().toISOString()}\nSUBDOMAIN=${SUBDOMAIN}`;
    writeStatus(msg);
    console.log(msg);
    startPing(tunnel.url);

    tunnel.on('close', () => {
      writeStatus('TUNNEL_STATUS=closed');
      console.log('Tunnel closed, reconnecting in 3s...');
      if (pingTimer) clearInterval(pingTimer);
      setTimeout(connect, 3000);
    });
    tunnel.on('error', (err) => {
      console.log('Tunnel error:', err.message);
    });
  } catch (err) {
    writeStatus(`TUNNEL_ERROR=${err.message}`);
    console.log('Connection failed:', err.message, '- retrying in 5s...');
    if (pingTimer) clearInterval(pingTimer);
    setTimeout(connect, 5000);
  }
}

connect();
