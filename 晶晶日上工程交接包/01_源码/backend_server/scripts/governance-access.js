'use strict';
const fs=require('node:fs/promises');
const {normalize,maintainOperatorGrant}=require('../src/modules/governance/operator-access');
const {openDatabase}=require('../src/infrastructure/database');
const {mysqlReady}=require('../src/http/operations');
async function main(args=process.argv.slice(2),env=process.env){
 const apply=args[0]==='--apply',file=args[apply?1:0];
 if(!file||file.startsWith('--')||args.length!==(apply?2:1))throw Object.assign(Error(),{code:'USAGE_JSON_FILE_OPTIONAL_APPLY'});
 const input=JSON.parse(await fs.readFile(file,'utf8'));normalize(input);
 if(!apply)return {status:'PREVIEW_ONLY_NO_DATABASE',account_id:input.account_id,action:input.action,enabled:input.enabled,expires_at:input.expires_at,expected_version:input.expected_version};
 if(env.DB_CLIENT!=='mysql'||!['test','development','production'].includes(env.NODE_ENV))throw Object.assign(Error(),{code:'EXPLICIT_MYSQL_ENV_REQUIRED'});
 const db=await openDatabase(env);
 try{if(!await mysqlReady(db)())throw Object.assign(Error(),{code:'MYSQL_MIGRATIONS_REQUIRED'});return {status:'APPLIED',...await maintainOperatorGrant(db,input)};}finally{await db.close();}
}
if(require.main===module)main().then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(JSON.stringify({status:'FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'INVALID_INPUT_OR_MAINTENANCE_FAILURE'}));process.exitCode=1;});
module.exports={main};
