"use strict";
// Build an empty, isolated schema. Never read business rows or the configured base database.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
async function main(){
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_copy_schema_'+randomBytes(8).toString('hex');
 const c=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD});let db,created=false;
 try{
  await c.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
  db=await require('../src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});await require('../src/infrastructure/database/migrator').migrate(db);
  const [columns]=await c.execute('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,ORDINAL_POSITION AS position,DATA_TYPE AS data_type,IS_NULLABLE AS nullable FROM information_schema.columns WHERE table_schema=? ORDER BY TABLE_NAME,ORDINAL_POSITION',[name]);
  const [versions]=await db.execute("SELECT version FROM platform_schema_migrations WHERE status='APPLIED' ORDER BY version");
  const out=path.resolve(__dirname,'../../../..','.local/personal-field-audit-20261110/schema.json');await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.writeFile(out,JSON.stringify({synthetic_only:true,business_rows_read:false,migration_versions:versions.map(x=>x.version),table_count:new Set(columns.map(x=>x.table_name)).size,column_count:columns.length,columns},null,2));
  process.stdout.write(JSON.stringify({table_count:new Set(columns.map(x=>x.table_name)).size,column_count:columns.length})+'\n');
 }finally{if(db)await db.close();if(created)await c.query('DROP DATABASE '+mysql.escapeId(name));await c.end();}
}
main().catch(e=>{process.stderr.write((e.code||e.name)+': schema audit failed\n');process.exitCode=1;});
