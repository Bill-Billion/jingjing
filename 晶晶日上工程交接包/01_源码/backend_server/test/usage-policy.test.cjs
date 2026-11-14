'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/privacy/usage-policy');
test('foreground reports count elapsed time once; burst retries cannot erase fractions',()=>{
 let d=P.pulse(P.empty('2026-11-02T01:00:00Z'),'2026-11-02T01:00:00Z');
 for(let i=1;i<10;i++)d=P.pulse(d,`2026-11-02T01:00:00.${i}00Z`);
 d=P.pulse(d,'2026-11-02T01:00:30Z');assert.equal(d.day_seconds,30);assert.equal(d.reminder_seconds,30);
 d=P.pulse(d,'2026-11-02T01:00:30Z');assert.equal(d.day_seconds,30);
 assert.throws(()=>P.pulse(d,'2026-11-02T01:00:29Z'),{code:'USAGE_CLOCK_REVIEW_REQUIRED'});
});
test('idle interval is not usage; exact boundary and midnight are handled',()=>{
 let d=P.pulse(P.empty('2026-11-02T15:59:30Z'),'2026-11-02T15:59:30Z');
 d=P.pulse(d,'2026-11-02T16:00:30Z');assert.equal(d.local_date,'2026-11-03');assert.equal(d.day_seconds,30);assert.equal(d.reminder_seconds,60);
 d=P.pulse(d,'2026-11-02T16:02:00Z');assert.equal(d.day_seconds,120);assert.equal(d.reminder_seconds,150);
 d=P.pulse(d,'2026-11-02T16:03:30.001Z');assert.equal(d.day_seconds,120);assert.equal(d.reminder_seconds,0);
 d=P.pulse(d,'2026-11-03T16:05:00Z');assert.equal(d.day_seconds,0);assert.equal(d.reminder_seconds,0);
});
test('reminders use current preference, are advisory, and idle clears stale due status',()=>{
 const at='2026-11-02T01:00:00Z',d={...P.empty(at),day_seconds:1200,reminder_seconds:900,last_at:at};
 assert.equal(P.view(d,at,15,3).rest_due,true);assert.equal(P.view(d,at,30,3).seconds_until_reminder,900);
 assert.equal(P.view(d,at,0,3).day_seconds,0);assert.equal(P.view(d,at,0,3).rest_due,false);
 assert.equal(P.view(d,'2026-11-02T01:01:31Z',15,3).rest_due,false);
});
