'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../src/modules/wallet/risk-policy'),P=require('../src/modules/privacy/notification-policy');
const rule={version:'synthetic',source_ref:'synthetic',message:'Synthetic confirmation',window_seconds:600,trigger_count:2,large_recharge_minor:100,night:{start_minute:1320,end_minute:480,minimum_minor:100},confirmation_seconds:600,lottery_window_max_draws:10,lottery_daily_points:3000};
test('cash and lottery rules use reviewed thresholds, Beijing time and separate units',()=>{
 assert.deepEqual(R.rule(rule),rule);assert.throws(()=>R.rule({...rule,trigger_count:1}));
 const u={cash_attempts:0,window_draws:0,day_points:0};
 assert.deepEqual(R.reasons(rule,{kind:'PAYMENT',amount_minor:100},u,'2026-11-03T13:59:59Z'),[]);
 for(const at of ['2026-11-03T14:00:00Z','2026-11-03T23:59:59Z'])assert.deepEqual(R.reasons(rule,{kind:'PAYMENT',amount_minor:100},u,at),['LARGE_NIGHT_SPENDING']);
 assert.deepEqual(R.reasons(rule,{kind:'RECHARGE',amount_minor:100},{...u,cash_attempts:1},'2026-11-04T00:00:00Z'),['FREQUENT_CASH_REQUESTS','LARGE_RECHARGE']);
 assert.deepEqual(R.reasons(rule,{kind:'LOTTERY',count:10,amount_minor:2700},u,'2026-11-03T01:00:00Z'),['RATIONAL_LOTTERY_PARTICIPATION']);
 assert.throws(()=>R.reasons(rule,{kind:'LOTTERY',count:1,amount_minor:300},{...u,window_draws:10},'2026-11-03T01:00:00Z'),{code:'LOTTERY_PARTICIPATION_LIMIT'});
 assert.throws(()=>R.reasons(rule,{kind:'LOTTERY',count:10,amount_minor:2700},{...u,day_points:600},'2026-11-03T01:00:00Z'),{code:'LOTTERY_PARTICIPATION_LIMIT'});
});
test('quiet hours cross midnight, explicit opt-in and daily marketing restraint',()=>{
 const p={marketing:true,push_enabled:true,night_reminder_enabled:true,quiet_hours:{enabled:true,start_minute:1320,end_minute:480}};
 assert.equal(P.decision(p,'BUSINESS','2026-11-03T14:00:00Z').retry_at,'2026-11-04T00:00:00.000Z');
 assert.equal(P.decision(p,'BUSINESS','2026-11-03T23:59:59Z').status,'DEFERRED');
 assert.equal(P.decision(p,'BUSINESS','2026-11-04T00:00:00Z').status,'READY');
 assert.equal(P.night(p,'2026-11-03T14:00:00Z').due,true);
 assert.equal(P.decision({...p,marketing:false},'MARKETING','2026-11-03T01:00:00Z').reason,'MARKETING_OPTED_OUT');
 assert.equal(P.decision({...p,push_enabled:false},'BUSINESS','2026-11-03T01:00:00Z').reason,'PUSH_DISABLED');
 assert.equal(P.decision(p,'MARKETING','2026-11-03T01:00:00Z',1).reason,'MARKETING_DAILY_LIMIT');
 assert.equal(P.decision(p,'BUSINESS','2026-11-03T01:00:00Z',1).status,'READY');
 assert.equal(P.normalize({}).push_enabled,false);assert.throws(()=>P.validate({quiet_hours:{enabled:true,start_minute:1,end_minute:1}}));
});
