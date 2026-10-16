'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const p=require('../src/modules/customization/policy');
const template=()=>({title:'合成婚礼故事',description:'仅用于隔离测试，不含真实人物资料',fields:[
 {key:'story',label:'共同经历',type:'TEXT',required:true,max_length:12000},
 {key:'tone',label:'希望的氛围',type:'CHOICE',required:true,options:['温暖','纪实']},
 {key:'notes',label:'补充说明',type:'TEXT',required:false,max_length:100}
]});
const rejects=(fn,field,reason)=>assert.throws(fn,e=>e.code==='CUSTOMIZATION_VALIDATION_FAILED'&&e.details.some(x=>x.field===(field==='answers'?field:'answers.'+field)&&x.reason===reason));

test('story drafts preserve omissions and deliberate empty values until formal submission',()=>{
 const t=template();assert.deepEqual(p.normalizeAnswers(t,{}),{});
 assert.deepEqual(p.normalizeAnswers(t,{story:'',notes:''}),{story:'',notes:''});
 const input={story:'  合成内容\n第二行  ',tone:'温暖'};
 assert.deepEqual(p.normalizeAnswers(t,input),input);
 rejects(()=>p.validateSubmission(t,{story:'   ',tone:'温暖'}),'story','REQUIRED');
 rejects(()=>p.validateSubmission(t,{story:'有效的合成文字'}),'tone','REQUIRED');
 assert.doesNotThrow(()=>p.validateSubmission(t,input));
});
test('category fields constrain answers without accepting prices, state or authority from the client',()=>{
 const t=template();
 rejects(()=>p.normalizeAnswers(t,{story:'test',current_status:'PAID'}),'answers','UNKNOWN_FIELD');
 rejects(()=>p.normalizeAnswers(t,{story:{text:'nested'}}),'story','INVALID_TYPE');
 rejects(()=>p.normalizeAnswers(t,{story:null}),'story','INVALID_TYPE');
 rejects(()=>p.normalizeAnswers(t,{tone:'没有发布的选项'}),'tone','INVALID_CHOICE');
 rejects(()=>p.normalizeAnswers(t,{notes:'字'.repeat(101)}),'notes','TOO_LONG');
 assert.throws(()=>p.normalizeAnswers(t,[]));
 rejects(()=>p.normalizeAnswers(t,JSON.parse('{"__proto__":"污染"}')),'answers','UNKNOWN_FIELD');
});
test('text bounds count Unicode characters while the overall saved answers have a byte limit',()=>{
 const t=template();assert.equal(p.normalizeAnswers(t,{notes:'😀'.repeat(100)}).notes.length,200);
 rejects(()=>p.normalizeAnswers(t,{notes:'😀'.repeat(101)}),'notes','TOO_LONG');
 const many={...t,fields:Array.from({length:5},(_,i)=>({key:'text_'+i,label:'合成'+i,type:'TEXT',required:false,max_length:12000}))};
 assert.throws(()=>p.normalizeAnswers(many,Object.fromEntries(many.fields.map(f=>[f.key,'汉'.repeat(12000)]))),e=>e.code==='CUSTOMIZATION_VALIDATION_FAILED');
});
test('required private materials cannot be replaced by a public URL, a raw file identifier or a fake successful upload',()=>{
 const t={...template(),fields:[...template().fields,{key:'portrait',label:'私有授权照片',type:'PRIVATE_ATTACHMENT',required:true}]};
 assert.equal(p.availability(t).submission_available,false);
 rejects(()=>p.normalizeAnswers(t,{portrait:'https://example.invalid/public.jpg'}),'portrait','ATTACHMENT_NOT_SUPPORTED');
 rejects(()=>p.normalizeAnswers(t,{portrait:'00000000-0000-0000-0000-000000000000'}),'portrait','ATTACHMENT_NOT_SUPPORTED');
 assert.throws(()=>p.validateSubmission(t,{story:'合成故事',tone:'温暖'}),e=>e.code==='CUSTOMIZATION_VALIDATION_FAILED'&&e.details.some(x=>x.reason==='ATTACHMENT_SUBMISSION_NOT_READY'));
 const optional={...t,fields:t.fields.map(f=>f.key==='portrait'?{...f,required:false}:f)};
 assert.equal(p.availability(optional).submission_available,true);
 assert.doesNotThrow(()=>p.validateSubmission(optional,{story:'合成故事',tone:'温暖'}));
});
test('published template validation rejects ambiguous field keys, unknown types and duplicate choices',()=>{
 const t=template();assert.deepEqual(p.normalizeTemplate(t),t);
 for(const fields of [[],[t.fields[0],t.fields[0]],[{...t.fields[0],key:'__proto__'}],[{...t.fields[0],key:'NotSnake'}],[{...t.fields[0],type:'PRICE'}],[{...t.fields[1],options:['重复','重复']}],[{...t.fields[0],required:'yes'}]])assert.throws(()=>p.normalizeTemplate({...t,fields}));
 assert.throws(()=>p.normalizeTemplate({...t,base_price:2500}));
});
test('pagination validates limits and state filters and operations cannot request private drafts',()=>{
 assert.doesNotThrow(()=>p.page({limit:20,current_status:'DRAFT'}));
 for(const limit of [0,-1,1.2,101,'20'])assert.throws(()=>p.page({limit}));
 assert.throws(()=>p.page({after:'not-a-uuid'}));
 assert.throws(()=>p.page({current_status:'PAID'}));
 assert.throws(()=>p.page({current_status:'DRAFT'},{operations:true}));
 assert.doesNotThrow(()=>p.page({current_status:'SUBMITTED'},{operations:true}));
});


test('customization plan keeps cumulative 90 percent and rounds remainder into final payment without changing inputs',()=>{
 const {plan}=require('../src/modules/customization/quote-policy');
 const lines=[{line_id:'a',total_minor:10001},{line_id:'b',total_minor:101}];
 const steps=['ORDER_ACCEPTED','CUSTOMIZATION_INTERIM_CONFIRMED','FINAL_ACCEPTED'].map((trigger,i)=>({key:'step'+i,trigger,allocations:[{line_id:'a',amount_minor:[3000,6000,1001][i]},{line_id:'b',amount_minor:[30,60,11][i]}],apple_product_id:null}));
 const original=structuredClone(steps);assert.deepEqual(plan(lines,steps),original);assert.deepEqual(steps,original);
 const wrong=structuredClone(steps);wrong[1].allocations[0].amount_minor=4000;wrong[2].allocations[0].amount_minor=3001;
 assert.throws(()=>plan(lines,wrong),{code:'CUSTOMIZATION_PAYMENT_PLAN_INVALID'});
});
test('customization interim payment is not silently treated as sample acceptance or a full upfront charge',()=>{
 const {plan}=require('../src/modules/customization/quote-policy');const lines=[{line_id:'a',total_minor:100}];
 assert.throws(()=>plan(lines,[{trigger:'ORDER_ACCEPTED',allocations:[{line_id:'a',amount_minor:100}]}]),{code:'CUSTOMIZATION_PAYMENT_PLAN_INVALID'});
 assert.throws(()=>plan(lines,['ORDER_ACCEPTED','SAMPLE_ACCEPTED','FINAL_ACCEPTED'].map((trigger,i)=>({trigger,allocations:[{line_id:'a',amount_minor:[30,60,10][i]}]}))),{code:'CUSTOMIZATION_PAYMENT_PLAN_INVALID'});
});
