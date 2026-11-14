import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url))
const server=await createServer({root,configFile:false,resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true,ws:false},appType:'custom'})
try {
 const m=await server.ssrLoadModule('/src/cocreation/invite.ts')
 const id='00000000-0000-0000-0000-000000000001', room='00000000-0000-0000-0000-000000000002',secret=id+'.'+'a'.repeat(64)
 assert.equal(m.parseInvite(secret,'https://example.test'),secret)
 assert.equal(m.parseInvite('https://example.test/cocreation/invitations#invite='+secret,'https://example.test'),secret)
 assert.equal(m.parseInvite('https://evil.test/cocreation/invitations#invite='+secret,'https://example.test'),null)
 assert.equal(m.parseInvite('https://example.test/cocreation/invitations?invite='+secret,'https://example.test'),null)
 assert.equal(m.parseInvite('https://example.test/cocreation/invitations#invite='+secret+'&next=x','https://example.test'),null)
 const record={id,room_id:room,current_status:'ACTIVE',object_version:1,expires_at:'2026-11-04T00:00:00.000Z'}
 assert(m.isLink(record,room));assert(!m.isLink({...record,token:secret},room));assert(m.isCreated({...record,token:secret,participation_required:true},room));assert(!m.isCreated({...record,token:secret,participation_required:false},room));assert(!m.isLink({...record,room_id:id},room))
 const claim={invitation_id:id,room_id:room,person_id:id,current_status:'INVITED',participation_required:true}
 assert(m.isClaim(claim,id));assert(!m.isClaim({...claim,participation_required:false},id));assert(!m.isClaim({...claim,person_id:room},id))
 const p={kind:'claim',account:id,party:room,key:id,person:id,tokenDigest:'b'.repeat(64)}
 assert(m.isPending(p));assert(!m.isPending({...p,token:secret}));assert(!JSON.stringify(p).includes(secret))
 console.log('共创邀请凭证解析、结果校验和无明文恢复记录通过')
} finally {await server.close()}
