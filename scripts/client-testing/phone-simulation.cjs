'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// No network adapter. Codes stay in the ignored local runtime directory, never in API responses.
async function create(db,m,dir){
 require('./persistent-story.cjs').validateManifest(m,m.database);
 assert(/^jx_test_explore_[0-9]+_[a-f0-9]{12}$/.test(m.database));
 const [[marker]]=await db.execute('SELECT id,synthetic_only FROM client_test_environment');
 assert(marker.id===m.environment_id&&marker.synthetic_only===1);
 const p=m.access.scenarios.complete?.phone;
 assert(p?.old_phone==='13900009801'&&p.new_phone==='13900009802');
 const codes={},file=path.join(dir,'phone-codes.json');let count=0;
 return {sms:{call:async(op,input)=>{
  assert(op==='send'&&[p.old_phone,p.new_phone].includes(input.phone),'SYNTHETIC_PHONE_NOT_ALLOWED');
  assert(++count<=30,'SYNTHETIC_SMS_LIMIT');codes[input.phone]=input.code;
  fs.writeFileSync(file,JSON.stringify({synthetic_only:true,codes}),{mode:0o600});return {accepted:true};
 }},authSettings:{resendMs:1,phoneSendsPerHour:30,ipSendsPerHour:50,totalSendsPerHour:50},
 cleanup:()=>fs.rmSync(file,{force:true})};
}
module.exports={create};
