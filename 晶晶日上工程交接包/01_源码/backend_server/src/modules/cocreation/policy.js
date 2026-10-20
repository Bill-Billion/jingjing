"use strict";
const {shape,id,ref,label,error}=require('../party/policy');
const {instant,amount,copy}=require('../trade/policy');
const {digest}=require('../governance/content');
function rules(v){
 shape(v,['version','source_ref','max_people','extension_days','participation_terms','benefit']);
 ref(v.version);ref(v.source_ref);label(v.participation_terms,8000);
 if(!Number.isInteger(v.max_people)||v.max_people<21||v.max_people>100||!Number.isInteger(v.extension_days)||v.extension_days<1||v.extension_days>90)throw error('INVALID_COCREATION_RULE',400);
 const x=v.benefit;shape(x,['service_code','description','credit_minor','valid_days']);ref(x.service_code);label(x.description,2000);amount(x.credit_minor);if(!Number.isInteger(x.valid_days)||x.valid_days<1||x.valid_days>730)throw error('INVALID_COCREATION_BENEFIT',400);
 return copy(v);
}
function participation(room){return digest({room_id:room.id,rule_sha256:room.data.rule_sha256,deadline:room.data.deadline,producer_party_id:room.data.producer_party_id,purpose:room.data.purpose,territory:room.data.territory});}
function counts(people){const joined=new Set(),eligible=new Set();for(const p of people){if(p.active)joined.add(p.person_id);if(p.active&&p.valid)eligible.add(p.person_id);}return {joined_count:joined.size,eligible_count:eligible.size,minimum_people:10,benefit_people:20,people_remaining:Math.max(0,10-eligible.size),benefit_remaining:Math.max(0,20-eligible.size)};}
function beforeDeadline(room,at){if(room.current_status!=='OPEN'||instant(room.data.deadline)<=instant(at))throw error('COCREATION_ENROLLMENT_CLOSED',409);}
function roster(v){if(!Array.isArray(v)||!v.length||v.length>4)throw error('COCREATION_CAST_LIMIT',400);return require('../production/customization-policy').cast({uses_identifiable_people:true,cast:v},v.map(x=>x.supply_consent_id)).cast;}
module.exports={rules,participation,counts,beforeDeadline,roster};
