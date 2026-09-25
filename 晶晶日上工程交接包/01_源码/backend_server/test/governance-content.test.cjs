'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const c = require('../src/modules/governance/content');
const at = '2026-09-23T00:00:00.000Z';
const rule = () => c.createRuleContent({id:'rule_1', rule_key:'synthetic_example', version:'test-only-1', terms:{notice:'合成测试条款，非正式业务规则', nested:{value:1}}});
const input = () => ({id:'snapshot_1', contract_version_id:'contract_1', party_ids:['party_1','party_2'], created_at:at,
  rules:[{content:rule(), current_status:'EFFECTIVE', effective_at:at}], commitments:{notice:'合成测试承诺，非商业默认参数'}});

test('content module runs without database, login, provider or third-party dependencies', () => {
  const script = `const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(!id.startsWith('node:')&&id!==process.argv[1])throw Error('Unexpected dependency');return load.call(this,id,...args);};require(process.argv[1]);`;
  const result=spawnSync(process.execPath,['-e',script,path.resolve(__dirname,'../src/modules/governance/content.js')],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);
});
test('key ordering does not change content identity; wording and array order do', () => {
  assert.equal(c.digest({b:2,a:{z:1,q:'条款😀'}}),c.digest({a:{q:'条款😀',z:1},b:2}));
  assert.notEqual(c.digest({text:'同意'}),c.digest({text:'不同意'}));
  assert.notEqual(c.digest([1,2]),c.digest([2,1]));
});
test('JSON roundtrip preserves the hash, including Unicode and numeric-looking keys', () => {
  const value={'10':'十','2':'二',text:'许可😀\n',fraction:0.125};
  assert.equal(c.digest(value),c.digest(JSON.parse(c.canonical(value))));
});
test('ambiguous values, accessors and hidden data are rejected without running getters', () => {
  let accessed=false;const getter={get value(){accessed=true;return 1;}};
  for(const value of [undefined,NaN,Infinity,-0,Number.MAX_SAFE_INTEGER+1,1n,()=>{},new Date(),new Map(),{x:undefined},getter,Object.defineProperty({},'hidden',{value:1}),{[Symbol('s')]:1}])assert.throws(()=>c.canonical(value));
  assert.equal(accessed,false);
});
test('cycles, sparse arrays, invalid Unicode, excessive depth and byte size are rejected', () => {
  const cycle={};cycle.self=cycle;const extra=[1];extra.other=2;
  let deep={};for(let i=0;i<26;i++)deep={child:deep};
  for(const value of [cycle,new Array(2),extra,'\ud800','\udc00',deep,{text:'中'.repeat(24000)}])assert.throws(()=>c.canonical(value));
});
test('special object keys stay data and cannot change prototypes', () => {
  const value=JSON.parse('{"__proto__":{"polluted":true},"constructor":"data"}');
  const result=JSON.parse(c.canonical(value));assert.equal(Object.getPrototypeOf(result),Object.prototype);
  assert.equal(Object.hasOwn(result,'__proto__'),true);assert.equal({}.polluted,undefined);
});
test('rules are deeply detached and frozen; new wording requires new content', () => {
  const source={id:'r',rule_key:'test',version:'1',terms:{nested:{value:1}}};const first=c.createRuleContent(source);
  source.terms.nested.value=2;assert.equal(first.terms.nested.value,1);
  assert.throws(()=>{first.terms.nested.value=3;},TypeError);
  assert.notEqual(first.content_sha256,c.createRuleContent(source).content_sha256);
  assert.deepEqual(c.verifyRuleContent(JSON.parse(JSON.stringify(first))),first);
});
test('empty or missing commitments never acquire invented business defaults', () => {
  for(const terms of [undefined,null,{},[]])assert.throws(()=>c.createRuleContent({id:'r',rule_key:'test',version:'1',terms}));
  const source=input();source.commitments={};assert.throws(()=>c.sealUnsignedContent(source),{code:'MISSING_TERMS'});
  const value=c.sealUnsignedContent(input());assert.deepEqual(value.commitments,{notice:'合成测试承诺，非商业默认参数'});
  assert.equal(Object.hasOwn(value.commitments,'price'),false);
});
test('draft, review, merely approved, retired and future rules cannot enter new snapshots', () => {
  for(const status of ['DRAFT','IN_REVIEW','APPROVED','RETIRED','unknown']){
    const source=input();source.rules[0].current_status=status;assert.throws(()=>c.sealUnsignedContent(source),{code:'RULE_NOT_EFFECTIVE'});
  }
  const future=input();future.rules[0].effective_at='2026-09-24T00:00:00.000Z';assert.throws(()=>c.sealUnsignedContent(future),{code:'RULE_NOT_EFFECTIVE'});
  assert.equal(c.sealUnsignedContent(input()).current_status,'SEALED');
});
test('timestamps must be explicit UTC instants and real calendar dates', () => {
  for(const date of ['2026-09-23','2026-02-30T00:00:00.000Z','2026-09-23T00:00:00+08:00']){
    const source=input();source.created_at=date;assert.throws(()=>c.sealUnsignedContent(source),{code:'INVALID_INSTANT'});
  }
});
test('later rule changes and retirement do not rewrite historical commitments', () => {
  const source=input(),saved=c.sealUnsignedContent(source),bytes=JSON.stringify(saved);
  source.rules[0].current_status='RETIRED';source.rules[0].content=c.createRuleContent({id:'rule_2',rule_key:'synthetic_example',version:'test-only-2',terms:{notice:'新的测试条款'}});
  source.commitments.notice='新的测试承诺';
  assert.equal(JSON.stringify(c.verifyUnsignedContent(JSON.parse(bytes))),bytes);
  assert.equal(saved.rule_contents[0].id,'rule_1');assert.equal(saved.commitments.notice,'合成测试承诺，非商业默认参数');
  assert.throws(()=>{saved.party_ids.push('other');},TypeError);
});
test('duplicate parties or conflicting versions of the same rule are rejected', () => {
  const a=input();a.party_ids.push('party_1');assert.throws(()=>c.sealUnsignedContent(a),{code:'DUPLICATE_PARTY'});
  const b=input();b.rules.push(b.rules[0]);assert.throws(()=>c.sealUnsignedContent(b),{code:'CONFLICTING_RULES'});
  const d=input();d.rules.push({...d.rules[0],content:c.createRuleContent({id:'rule_2',rule_key:'synthetic_example',version:'2',terms:{notice:'other'}})});assert.throws(()=>c.sealUnsignedContent(d),{code:'CONFLICTING_RULES'});
});
test('tampered promises, participants or nested rule content are detected after storage roundtrip', () => {
  const saved=c.sealUnsignedContent(input());
  for(const mutate of [v=>{v.commitments.notice='changed';},v=>{v.party_ids[0]='intruder';},v=>{v.rule_contents[0].terms.nested.value=8;}]){
    const copy=JSON.parse(JSON.stringify(saved));mutate(copy);assert.throws(()=>c.verifyUnsignedContent(copy),{code:'CONTENT_HASH_MISMATCH'});
  }
});
test('sealing never grants signed, paid or effective-license status', () => {
  const saved=c.sealUnsignedContent(input());assert.equal(saved.signing_method,'NOT_SIGNED');
  for(const field of ['signed','paid','license_active','allowed_actions'])assert.equal(Object.hasOwn(saved,field),false);
  const source=input();source.signing_method='OFFLINE_SIGNED';assert.throws(()=>c.sealUnsignedContent(source),{code:'INVALID_CONTENT_SHAPE'});
  const altered=JSON.parse(JSON.stringify(saved));altered.signing_method='PLATFORM_ESIGN';assert.throws(()=>c.verifyUnsignedContent(altered),{code:'INVALID_SNAPSHOT_STATE'});
});
test('unknown formats are rejected, instead of being silently reinterpreted', () => {
  const value=JSON.parse(JSON.stringify(c.sealUnsignedContent(input())));value.format_version='future-format';
  assert.throws(()=>c.verifyUnsignedContent(value),{code:'UNKNOWN_CONTENT_FORMAT'});
});
