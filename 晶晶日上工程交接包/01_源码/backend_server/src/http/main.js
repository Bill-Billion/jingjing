 'use strict';
const {openDatabase}=require('../infrastructure/database');
const {mysqlReady}=require('./operations');
const {createSmsProvider}=require('../modules/providers/sms');
const {createAccountApi}=require('./account-api');
async function main(env=process.env) {
 if(env.DB_CLIENT!=='mysql'||!['development','test','production'].includes(env.NODE_ENV))throw Error('EXPLICIT_MYSQL_ENV_REQUIRED');
 const port=Number(env.PORT||3000);if(!Number.isInteger(port)||(port<1&&!(port===0&&env.NODE_ENV==='test'))||port>65535)throw Error('INVALID_PORT');
 const db=await openDatabase(env);let server;
 try {
  if(!await mysqlReady(db)())throw Error('MYSQL_MIGRATIONS_REQUIRED');
  const settings=env.AUTH_SETTINGS_JSON?JSON.parse(env.AUTH_SETTINGS_JSON):{};
  const app=createAccountApi({db,secret:env.AUTH_SECRET_BASE64,sms:createSmsProvider(db,env),authSettings:settings,allowedOrigins:(env.API_ALLOWED_ORIGINS||'').split(',').filter(Boolean)});
  server=app.listen(port,env.HOST||'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  let closing;const stop=()=>{if(closing)return closing;process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);closing=new Promise(resolve=>server.close(()=>db.close().catch(()=>{}).finally(resolve)));server.closeIdleConnections();return closing;};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  return {server,stop};
 }catch(e){if(server)server.close();await db.close();throw e;}
}
if(require.main===module)main().catch(()=>{console.error('Account API startup failed: check explicit configuration and MySQL migrations; no SQLite fallback.');process.exitCode=1;});
module.exports={main};
