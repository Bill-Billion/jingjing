 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),path=require('node:path');
const p=require('../src/modules/party/policy');
const org={kind:'ORGANIZATION',current_status:'PENDING_REVIEW'};
const owner={role_code:'OWNER',current_status:'ACTIVE'};
test('party rules load with built-ins only, without database or provider modules',()=>{
 const script=`const Module=require('node:module'),original=Module._load;
 Module._load=function(id,...rest){if(!id.startsWith('node:')&&!id.endsWith('/src/modules/party/policy'))throw Error('Unexpected dependency: '+id);return original.call(this,id,...rest);};
 const rules=require(process.argv[1]);if(!rules.allowedActions)process.exit(2);`;
 const result=spawnSync(process.execPath,['-e',script,path.resolve(__dirname,'../src/modules/party/policy').replaceAll('\\','/')],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);
});
test('pending organization owner can manage membership but gains no commercial authority',()=>{
 const actions=p.allowedActions(org,owner);
 assert.deepEqual(actions,['READ_PARTY','REQUEST_CAPABILITY','MANAGE_MEMBERS']);
 for(const action of ['PAY','USE_WORK','PLATFORM_ADMIN','READ_TALENT_INCOME'])assert.ok(!actions.includes(action));
 assert.deepEqual(p.allowedActions({...org,kind:'PERSON'},owner),['READ_PARTY','REQUEST_CAPABILITY']);
});
test('inactive membership, missing membership and suspended/closed parties expose no actions',()=>{
 for(const m of [null,{...owner,current_status:'REVOKED'},{...owner,current_status:'SUSPENDED'}])assert.deepEqual(p.allowedActions(org,m),[]);
 for(const status of ['SUSPENDED','CLOSED'])assert.deepEqual(p.allowedActions({...org,current_status:status},owner),[]);
 assert.deepEqual(p.allowedActions(org,{...owner,role_code:'MEMBER'}),['READ_PARTY']);
});
test('owner-only actions reject ordinary members, personal parties and missing memberships',()=>{
 p.assertOwner(org,owner,true);
 for(const m of [null,{...owner,role_code:'MEMBER'},{...owner,current_status:'REVOKED'}])assert.throws(()=>p.assertOwner(org,m,true),{code:'PARTY_ACTION_FORBIDDEN'});
 assert.throws(()=>p.assertOwner({...org,kind:'PERSON'},owner,true),{code:'PARTY_ACTION_FORBIDDEN'});
});
test('invitation transition checks version, pending status and numeric expiry in order',()=>{
 const row={object_version:3,current_status:'INVITED',expired:'0'};
 p.pending(row,3);
 assert.throws(()=>p.pending(row,2),{code:'VERSION_CONFLICT',status:412});
 assert.throws(()=>p.pending({...row,current_status:'ACCEPTED'},3),{code:'INVITATION_NOT_PENDING'});
 assert.throws(()=>p.pending({...row,expired:'1'},3),{code:'INVITATION_EXPIRED'});
 for(const value of [undefined,0,'3',3.5,4294967295])assert.throws(()=>p.pending(row,value),{code:'EXPECTED_VERSION_REQUIRED'});
});
test('input validation refuses injected authority, invalid references and oversized unicode names',()=>{
 assert.throws(()=>p.shape({display_name:'name',role:'OWNER'},['display_name']),{code:'INVALID_INPUT'});
 for(const input of [null,[],false])assert.throws(()=>p.shape(input,[]),{code:'INVALID_INPUT'});
 for(const value of ['','a b','x'.repeat(129)])assert.throws(()=>p.ref(value),{code:'INVALID_REFERENCE'});
 assert.equal(p.label('🎬'.repeat(80),80),'🎬'.repeat(80));
 assert.throws(()=>p.label('🎬'.repeat(81),80),{code:'INVALID_DISPLAY_NAME'});
 assert.throws(()=>p.id('caller-controlled-id'),{code:'INVALID_ID'});
});
