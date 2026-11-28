// Real HTTP negative case on the original isolated project after recast.
// Reusing the old private production cannot silently borrow the departed cast's release scope.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,join,sep } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=process.cwd(),dir=resolve(process.argv[2]),out=resolve(process.argv[3]);
assert(dir.startsWith(join(root,'.local/qa18')+sep)&&out.startsWith(join(root,'.local/qa18')+sep));
const read=async p=>JSON.parse(await readFile(p,'utf8')),a=await read(join(dir,'access.json'));
assert(a.synthetic_only&&Date.parse(a.expires_at)>Date.now()&&new URL(a.base_url).hostname==='127.0.0.1');
const previous=await read(join(root,'.local/qa18/participation-release-20261126-31/browser/checkpoint.json'));
const recast=await read(join(root,'.local/qa18/participation-recast-context-20261126-35/browser/checkpoint.json'));
assert(previous.complete&&recast.complete&&a.database===previous.environment&&a.database===recast.environment);
await mkdir(out,{recursive:true});const cases=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function call(path,{body,version,status=200}={}){
 const response=await fetch(a.base_url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+a.accounts.buyer.bearer_token,'X-Acting-Party':a.accounts.buyer.party_id,...body?{'Content-Type':'application/json','Idempotency-Key':randomUUID(),'If-Match':'"'+version+'"'}:{}},...body?{body:JSON.stringify(body)}:{}});
 const value=await response.json();cases.push({method:body?'POST':'GET',path:new URL(a.base_url+path).pathname,schema:response.status===200?(new URL(a.base_url+path).pathname.endsWith('/records')?'ProjectListResponse':'ProjectRecordResponse'):'ErrorResponse',value});
 await writeFile(join(out,'old-production-guard-http.json'),JSON.stringify({synthetic_only:true,cases},null,2));assert.equal(response.status,status,JSON.stringify(value.error));return response.status===200?value.data:value.error;
}
const path='/projects/projects/'+previous.project.id+'/plans',record='/projects/records/'+previous.project.id;
const before=await call(record),listPath='/projects/projects/'+previous.project.id+'/records?kind=PLAN&limit=100';
const plansBefore=await call(listPath);assert.equal(plansBefore.next_cursor,null);
const body={production_project_id:previous.production.id,rights:previous.plan.data.rights,confirmers:['buyer','artist','producer','replacement'].map(role=>({party_id:a.accounts[role].party_id,responsibility:'Synthetic recast negative control; old private production must not imply new release permission.',after_party_ids:[]})),funding:[],terms:'Synthetic negative control: new performer agreement does not authorize reuse of old private production as a newly released recast edition.'};
const result=await call(path,{body,version:before.object_version,status:409});assert.equal(result.code,'SOURCE_RELEASE_CONSENT_REQUIRED');
const after=await call(record),plansAfter=await call(listPath);assert.deepEqual(after,before);assert.deepEqual(plansAfter,plansBefore);
const report={result:'PASS_EXPECTED_REJECTION',source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),database:a.database,project_id:before.id,old_production_id:previous.production.id,old_final_id:previous.final.id,recast_agreement_id:recast.amendment.id,rejected_code:result.code,project_sha256:sha(JSON.stringify(after)),old_plan_count:plansBefore.items.length,new_plan_count:plansAfter.items.length,no_project_write:true,live_http:cases.length,next:'Prepare a separately contracted production using the replacement performer and explicit new authorization; keep old production/contract/edition and money unchanged.',formal_promotions:0};
await writeFile(join(out,'OLD_PRODUCTION_GUARD.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
