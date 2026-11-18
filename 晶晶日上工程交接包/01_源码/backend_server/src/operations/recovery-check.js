'use strict';
const {status}=require('../infrastructure/database/migrator');

// Observations only: never starts jobs, changes migration history or releases quarantine.
async function inspect(db){
 return db.withConnection(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try{
   const alerts=[];let schema,jobs,recovery;
   const alert=(code,severity)=>alerts.push({code,severity});
   try{
    const s=await status({withConnection:fn=>fn(c)}),counts={};
    for(const m of s.migrations)counts[m.status]=(counts[m.status]||0)+1;
    schema={readable:true,ready:s.migrations.length>0&&s.migrations.every(m=>m.status==='APPLIED'),counts};
    if(!schema.ready)alert('SCHEMA_NOT_READY','BLOCKED');
   }catch(e){
    if(!['MIGRATION_DRIFT','MIGRATION_ORDER_INVALID','MIGRATION_FILENAME_INVALID','MIGRATION_EMPTY'].includes(e.code))throw e;
    schema={readable:false,ready:false,code:e.code};alert(e.code,'BLOCKED');
   }
   try{
    const [rows]=await c.execute("SELECT schema_key,schema_value FROM platform_schema_metadata WHERE schema_key IN ('recovery_status','privacy_erasure_status')");
    const values=new Map(rows.map(r=>[r.schema_key,r.schema_value]));
    const state=values.get('recovery_status'),privacy=values.get('privacy_erasure_status');
    recovery={readable:true,status:state===undefined?'NOT_RESTORED':['QUARANTINED','RELEASED'].includes(state)?state:'UNKNOWN',privacy_replayed:privacy==='REPLAYED'};
    if(state!==undefined&&(state!=='RELEASED'||privacy!=='REPLAYED'))alert('RESTORE_REVIEW_REQUIRED','BLOCKED');
   }catch(e){if(e.code!=='ER_NO_SUCH_TABLE')throw e;recovery={readable:false,status:'UNAVAILABLE',privacy_replayed:false};alert('RECOVERY_METADATA_UNAVAILABLE','BLOCKED');}
   try{
    const [rows]=await c.execute('SELECT status,COUNT(*) count FROM platform_jobs GROUP BY status');
    const [[expired]]=await c.execute("SELECT COUNT(*) count FROM platform_jobs WHERE status='RUNNING' AND (lease_until IS NULL OR lease_until<=CURRENT_TIMESTAMP(6))");
    const counts=Object.fromEntries(rows.map(r=>[r.status,Number(r.count)]));
    jobs={readable:true,counts,expired_running:Number(expired.count)};
    if((counts.PENDING||0)+(counts.RETRY||0)>0)alert('JOBS_WAITING','INFO');
    if(counts.BLOCKED)alert('JOBS_BLOCKED','WARNING');
    if(counts.FAILED)alert('JOBS_FAILED','WARNING');
    if(jobs.expired_running)alert('JOB_LEASE_EXPIRED','WARNING');
   }catch(e){if(e.code!=='ER_NO_SUCH_TABLE')throw e;jobs={readable:false};alert('JOBS_UNAVAILABLE','BLOCKED');}
   return {format:'JX_RECOVERY_OBSERVATION_V1',generated_at:new Date().toISOString(),schema,recovery,jobs,alerts,attention_required:alerts.some(a=>a.severity!=='INFO'),observation_only:true,production_release:'NOT_APPROVED',runtime_started:false,external_transport_checked:false};
  }finally{await c.rollback();}
 });
}
module.exports={inspect};
