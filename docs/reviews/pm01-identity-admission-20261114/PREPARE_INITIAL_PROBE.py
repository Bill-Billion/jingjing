from pathlib import Path
import json
root=Path.cwd();backend=root/'晶晶日上工程交接包/01_源码/backend_server';original=backend/'test/minor-business-actor.integration.test.cjs'
s=original.read_text(encoding='utf8');s=s.replace("known minor business actor cannot bypass age restriction by acting for an adult artist organization","organization publishing requires the actual actor identity independently of the adult artist")
s=s.replace("  await identity('ADULT');\n",'',1)
start=s.index('  let listed;const op=key();');end=s.index('  await fs.mkdir',start)
probe='''  const op=key();let listed;
  await t.test('unverified organization actor cannot publish another adult artist',async()=>{
   const r=await call('POST','/stock/listings',input);assert.ok([403,409].includes(r.status),'expected identity refusal, actual HTTP '+r.status);records.push({case:'unverified',status:r.status});
  });
  await identity('ADULT');
  await t.test('same valid request succeeds after trusted adult identity verification',async()=>{
   const r=await call('POST','/stock/listings',input,org.party_id,op);assert.equal(r.status,200,JSON.stringify(r));listed=r.data;records.push({case:'adult',status:r.status,listing_id:listed.id});
  });
  await t.test('expired personal identity blocks both new publishing and original successful replay',async()=>{
   await db.execute("UPDATE artist_people SET identity_valid_until='2020-01-01 00:00:00' WHERE id=?",[person.id]);
   for(const operation of [key(),op]){const r=await call('POST','/stock/listings',input,org.party_id,operation);assert.ok([403,409].includes(r.status),'expected expired identity refusal, actual HTTP '+r.status);}
  });
  await t.test('rejected personal identity verification does not authorize organization publishing',async()=>{
   await identity('UNKNOWN','REJECTED');const r=await call('POST','/stock/listings',input);assert.ok([403,409].includes(r.status),'expected rejected identity refusal, actual HTTP '+r.status);
  });
'''
s=s[:start]+probe+s[end:];s=s.replace('minor-business-actor-http.json','unverified-actor-probe-http.json').replace('minor-business-actor-records.json','unverified-actor-probe-records.json')
wrapped="(function(require,__dirname){\n"+s+"\n})(require('node:module').createRequire("+json.dumps(str(original))+"),"+json.dumps(str(backend/'test'))+");\n"
p=root/'.local/unverified-actor-probe.cjs';p.write_bytes(wrapped.encode('utf8'));print(p)
