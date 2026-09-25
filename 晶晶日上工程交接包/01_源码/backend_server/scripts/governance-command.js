'use strict';
const fs=require('node:fs/promises');
const {canonical}=require('../src/modules/governance/content');
const {createGovernanceService,validateCommand}=require('../src/modules/governance/service');
const {openDatabase}=require('../src/infrastructure/database');
const {mysqlReady}=require('../src/http/operations');
async function main(args=process.argv.slice(2),env=process.env){
 const apply=args[0]==='--execute',file=args[apply?1:0];
 if(!file||file.startsWith('--')||args.length!==(apply?2:1))throw Object.assign(Error(),{code:'USAGE_JSON_FILE_OPTIONAL_EXECUTE'});
 const request=validateCommand(JSON.parse(canonical(JSON.parse(await fs.readFile(file,'utf8')))));
 if(!apply)return {status:'PREVIEW_ONLY_NO_DATABASE',command:request.command,business_validated:false};
 if(env.DB_CLIENT!=='mysql'||!['test','development','production'].includes(env.NODE_ENV))throw Object.assign(Error(),{code:'EXPLICIT_MYSQL_ENV_REQUIRED'});
 if(!/^[A-Za-z0-9_-]{43}$/.test(env.GOVERNANCE_SESSION_TOKEN||''))throw Object.assign(Error(),{code:'AUTHENTICATION_REQUIRED'});
 const db=await openDatabase(env);
 try{
  if(!await mysqlReady(db)())throw Object.assign(Error(),{code:'MYSQL_MIGRATIONS_REQUIRED'});
  const service=createGovernanceService({db,secret:env.AUTH_SECRET_BASE64,environment:env.NODE_ENV==='production'?'PRODUCTION':'SANDBOX'});
  return {status:'EXECUTED',data:await service.execute(env.GOVERNANCE_SESSION_TOKEN,request)};
 }finally{await db.close();}
}
if(require.main===module)main().then(value=>console.log(JSON.stringify(value))).catch(error=>{
 console.error(JSON.stringify({status:'FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'INVALID_INPUT_OR_COMMAND_FAILURE'}));process.exitCode=1;
});
module.exports={main};
