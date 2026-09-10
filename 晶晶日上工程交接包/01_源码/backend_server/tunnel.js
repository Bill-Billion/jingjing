// tunnel.js - 启动localtunnel公网隧道，带自动重连
const localtunnel = require('localtunnel');

const PORT = 3000;
let retryCount = 0;

async function startTunnel() {
  try {
    const tunnel = await localtunnel({ port: PORT, subdomain: 'jingjing' });
    console.log('========================================');
    console.log('  晶晶日上 公网隧道已启动');
    console.log('  公网地址: ' + tunnel.url);
    console.log('  本地地址: http://localhost:' + PORT);
    console.log('========================================');
    console.log('请在APP设置页将服务器地址设为: ' + tunnel.url);
    console.log('（保持此窗口运行，关闭则隧道断开）');
    console.log('');

    tunnel.on('close', () => {
      console.log('隧道关闭，3秒后重连...');
      retryCount++;
      setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
      console.log('隧道错误:', err.message);
    });
  } catch (err) {
    retryCount++;
    console.log(`连接失败(${retryCount}次)，3秒后重试...`, err.message);
    setTimeout(startTunnel, 3000);
  }
}

startTunnel();
