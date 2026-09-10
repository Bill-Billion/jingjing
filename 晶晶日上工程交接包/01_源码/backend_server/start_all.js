// start_all.js - 同时启动后端和隧道
const { spawn } = require('child_process');
const path = require('path');
const localtunnel = require('localtunnel');

const PORT = 3000;

// 启动后端
const server = spawn('node', ['app.js'], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

// 等待后端启动后建立隧道
setTimeout(async () => {
  try {
    const tunnel = await localtunnel({ port: PORT });
    console.log('\n========== TUNNEL URL ==========');
    console.log(tunnel.url);
    console.log('================================\n');
    
    tunnel.on('close', () => {
      console.log('Tunnel closed, reconnecting...');
      setTimeout(connectTunnel, 3000);
    });
    tunnel.on('error', (e) => console.log('Tunnel error:', e.message));
  } catch (e) {
    console.log('Tunnel failed:', e.message);
  }
}, 3000);
