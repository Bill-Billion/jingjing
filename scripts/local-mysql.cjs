'use strict';
// Workspace-only MySQL helper. Never reads backend .env or registers a service.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const mysql = require('../晶晶日上工程交接包/01_源码/backend_server/node_modules/mysql2/promise');
const workspaceRoot = path.resolve(__dirname, '..');
const root = path.resolve(process.env.LOCAL_MYSQL_ROOT || workspaceRoot);
// Windows MySQL may require an ASCII drive alias for a Unicode workspace.
// An alias must identify the same physical directory, not another data workspace.
const expectedRoot = fs.statSync(workspaceRoot, { bigint:true });
const actualRoot = fs.statSync(root, { bigint:true });
if (expectedRoot.dev !== actualRoot.dev || expectedRoot.ino !== actualRoot.ino) throw new Error('LOCAL_MYSQL_ROOT must alias this repository root');
const home = path.resolve(process.env.LOCAL_MYSQL_HOME || path.join(root, '.local/mysql/mysql-8.4.11-winx64'));
const runtime = path.join(root, '.local/mysql/runtime');
const settingsPath = path.join(runtime, 'settings.json');
const exe = path.join(home, 'bin', process.platform === 'win32' ? 'mysqld.exe' : 'mysqld');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function admin(settings) {
  return mysql.createConnection({ host:'127.0.0.1', port:settings.port, user:'jx_local_admin', password:settings.rootPassword, connectTimeout:1000 });
}
async function main() {
  const command = process.argv[2];
  if (!['start','stop','status'].includes(command)) throw new Error('Usage: node scripts/local-mysql.cjs start|stop|status');
  fs.mkdirSync(runtime, { recursive:true });
  if (!fs.existsSync(settingsPath)) {
    if (command !== 'start') throw new Error('Local MySQL has not been initialized');
    // A failed/foreign initialization is never overwritten.
    if (fs.existsSync(path.join(runtime,'data'))) throw new Error('Existing data without settings; inspect manually, no overwrite');
    const settings={port:33316,rootPassword:crypto.randomBytes(24).toString('hex'),password:crypto.randomBytes(24).toString('hex')};
    fs.writeFileSync(settingsPath, JSON.stringify(settings), { mode:0o600, flag:'wx' });
  }
  const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
  if (settings.port !== 33316) throw new Error('Unexpected local port; inspect settings');
  if (command === 'status' || command === 'stop') {
    const connection=await admin(settings);
    try {
      const [[info]]=await connection.query('SELECT @@datadir AS data_dir, VERSION() AS version');
      const actual=fs.statSync(info.data_dir,{bigint:true});
      const expected=fs.statSync(path.join(runtime,'data'),{bigint:true});
      if (actual.dev!==expected.dev || actual.ino!==expected.ino) throw new Error('Connected datadir is outside this isolated runtime');
      if (command === 'stop') await connection.query('SHUTDOWN');
      console.log(JSON.stringify({ status:command==='stop'?'STOP_REQUESTED':'RUNNING',version:info.version,host:'127.0.0.1',port:settings.port }));
    } finally { await connection.end().catch(()=>{}); }
    return;
  }
  if (!fs.existsSync(exe)) throw new Error('Set LOCAL_MYSQL_HOME to an extracted official MySQL8 installation');
  const version=spawnSync(exe,['--no-defaults','--version'],{encoding:'utf8',windowsHide:true});
  if (version.status!==0 || !/Ver 8\./.test(version.stdout)) throw new Error('Expected an executable MySQL8 server');
  // Refuse to bind a port already used by any process, including a running copy of this helper.
  const net=require('node:net');
  await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(settings.port,'127.0.0.1',()=>server.close(resolve));});
  const data=path.join(runtime,'data');
  const cnf=path.join(runtime,'my.cnf');
  const iniPath=(p)=>'"'+p.replace(/\\/g,'/')+'"';
  const initFile=path.join(runtime,'initialize-users.sql');
  fs.writeFileSync(initFile,[
    `ALTER USER 'root'@'localhost' IDENTIFIED BY '${settings.rootPassword}';`,
    `CREATE USER IF NOT EXISTS 'jx_local_admin'@'127.0.0.1' IDENTIFIED BY '${settings.rootPassword}';`,
    "GRANT SHUTDOWN ON *.* TO 'jx_local_admin'@'127.0.0.1';",
    `CREATE USER IF NOT EXISTS 'jx_local'@'127.0.0.1' IDENTIFIED BY '${settings.password}';`,
    'CREATE DATABASE IF NOT EXISTS jx_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;',
    "GRANT ALL PRIVILEGES ON jx_dev.* TO 'jx_local'@'127.0.0.1';",
    "GRANT ALL PRIVILEGES ON `jx_test_%`.* TO 'jx_local'@'127.0.0.1';",
  ].join('\n')+'\n',{mode:0o600});
  const config=[ '[mysqld]',`basedir=${iniPath(home)}`,`datadir=${iniPath(data)}`,
    'bind-address=127.0.0.1',`port=${settings.port}`,'mysqlx=0','skip-log-bin','skip-name-resolve',
    'character-set-server=utf8mb4','collation-server=utf8mb4_0900_ai_ci','default-storage-engine=InnoDB',
    'innodb-buffer-pool-size=134217728',`log-error=${iniPath(path.join(runtime,'server.log'))}`,
    `pid-file=${iniPath(path.join(runtime,'server.pid'))}`];
  fs.writeFileSync(cnf,config.join('\n')+'\n');
  if (!fs.existsSync(data)) {
    const fd=fs.openSync(path.join(runtime,'initialize.log'),'a');
    try {
      const init=spawnSync(exe,[`--defaults-file=${cnf}`,'--initialize-insecure'],{stdio:['ignore',fd,fd],windowsHide:true});
      if (init.status!==0) throw new Error('MySQL initialization failed; inspect .local logs (no overwrite attempted)');
    } finally { fs.closeSync(fd); }
  }
  const child=spawn(exe,[`--defaults-file=${cnf}`,`--init-file=${initFile}`],{detached:true,stdio:'ignore',windowsHide:true});
  child.unref();
  for (let n=0;n<60;n++) {
    try { const c=await admin(settings); await c.ping(); await c.end();
      // Secret test config is local-only and intentionally not printed.
      const environment={NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:String(settings.port),MYSQL_USER:'jx_local',MYSQL_PASSWORD:settings.password,MYSQL_DATABASE:'jx_dev'};
      fs.writeFileSync(path.join(runtime,'test-env.json'),JSON.stringify(environment),{mode:0o600});
      fs.writeFileSync(path.join(runtime,'client.env'),Object.entries(environment).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});
      console.log(JSON.stringify({status:'RUNNING',host:'127.0.0.1',port:settings.port,service_installed:false}));return;
    } catch { await sleep(500); }
  }
  throw new Error('MySQL readiness timed out; inspect .local/mysql/runtime/server.log');
}
main().catch((error)=>{ console.error(error.code || error.message); process.exitCode=1; });
