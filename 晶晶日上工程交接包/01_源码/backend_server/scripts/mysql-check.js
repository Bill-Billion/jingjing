'use strict';
const { openDatabase } = require('../src/infrastructure/database');
async function main() {
  const db=await openDatabase();
  try {
    const [[row]]=await db.execute('SELECT VERSION() AS version, @@session.time_zone AS timezone, @@session.sql_mode AS sql_mode');
    console.log(JSON.stringify({status:'CONNECTED',...row,application_routes_migrated:false}));
  } finally { await db.close(); }
}
main().catch((error)=>{console.error(JSON.stringify({error:error.code || 'DATABASE_UNAVAILABLE'}));process.exitCode=1;});
