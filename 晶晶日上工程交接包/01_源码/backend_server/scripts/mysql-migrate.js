'use strict';
const { openDatabase } = require('../src/infrastructure/database');
const { migrate, status } = require('../src/infrastructure/database/migrator');
async function main() {
  const [mode='status', ...args] = process.argv.slice(2);
  if (!['status','up','retry'].includes(mode)) throw new Error('Usage: mysql-migrate.js status|up|retry VERSION CHECKSUM REASON');
  if (mode==='retry' && args.length!==3) throw new Error('Retry requires VERSION CHECKSUM REASON');
  // Deliberately does not load .env: process configuration must be explicit.
  const db=await openDatabase();
  try {
    const result=mode==='status' ? await status(db) : await migrate(db, mode==='retry' ? {retryVersion:args[0],expectedChecksum:args[1],reason:args[2]} : {});
    console.log(JSON.stringify(result,null,2));
  } finally { await db.close(); }
}
main().catch((error)=>{console.error(JSON.stringify({error:error.code || 'MIGRATION_COMMAND_FAILED'}));process.exitCode=1;});
