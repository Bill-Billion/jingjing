from pathlib import Path
p=Path('.local/unverified-actor-probe.cjs');s=p.read_text(encoding='utf8')
s=s.replace("actions:['SUBMIT_LISTING']","actions:['SUBMIT_LISTING','MANAGE_AVATARS']")
marker="  await identity('ADULT');\n  await t.test('same valid request"
block="""  await t.test('unverified organization actor cannot create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic delegated avatar'});assert.ok([403,409].includes(r.status),'expected identity refusal for avatar, actual HTTP '+r.status);
  });
"""
assert marker in s;s=s.replace(marker,block+marker,1)
marker="  await t.test('expired personal identity blocks"
block="""  await t.test('verified organization actor may create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic valid delegated avatar'});assert.equal(r.status,200,JSON.stringify(r));
  });
"""
s=s.replace(marker,block+marker,1)
marker="  await t.test('rejected personal identity verification"
block="""  await t.test('expired personal identity cannot create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic expired delegated avatar'});assert.ok([403,409].includes(r.status),'expected expired identity refusal for avatar, actual HTTP '+r.status);
  });
"""
s=s.replace(marker,block+marker,1)
marker='  await fs.mkdir'
block="""  await t.test('rejected personal identity cannot create a delegated digital person',async()=>{
   const r=await call('POST','/artists/people/'+seller.person.id+'/avatars',{display_name:'synthetic rejected delegated avatar'});assert.ok([403,409].includes(r.status),'expected rejected identity refusal for avatar, actual HTTP '+r.status);
  });
"""
s=s.replace(marker,block+marker,1).replace('unverified-actor-probe-http.json','unverified-actor-probe-v2-http.json').replace('unverified-actor-probe-records.json','unverified-actor-probe-v2-records.json')
Path('.local/unverified-actor-probe-v2.cjs').write_bytes(s.encode('utf8'))
