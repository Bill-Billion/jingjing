'use strict';
const {error}=require('../party/policy');
const {instant}=require('../trade/policy');
const {integer,MAX}=require('./policy');
// Implementation recommendation, not a number supplied by the contract. Versioned in each request.
const VERSION='SELF_MONTHLY_LIMIT_V1', COOLING_HOURS=24;
function kind(value){if(!['RECHARGE','PAYMENT'].includes(value))throw error('CONSUMER_LIMIT_KIND_INVALID',400);return value;}
function amount(value){if(value!==null)integer(value,0,MAX);return value;}
function period(now){instant(now);const month=new Date(Date.parse(now)+8*3600000).toISOString().slice(0,7),start=new Date(month+'-01T00:00:00+08:00'),end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)-8*3600000);return {month,starts_at:start.toISOString(),ends_at:end.toISOString(),timezone:'Asia/Shanghai'};}
function change(current,target,now){amount(current);amount(target);instant(now);if(current===target)return {action:'UNCHANGED'};if(target!==null&&(current===null||target<current))return {action:'LOWER',value:target};return {action:'RAISE',pending:{monthly_limit_minor:target,requested_at:now,confirm_after:new Date(Date.parse(now)+COOLING_HOURS*3600000).toISOString(),policy_version:VERSION,cooling_hours:COOLING_HOURS}};}
function remaining(limit,used){amount(limit);integer(used);return limit===null?null:Math.max(0,limit-used);}
function enforce(limit,used){remaining(limit,used);if(limit!==null&&used>limit)throw error('CONSUMER_MONTHLY_LIMIT_EXCEEDED',409);}
module.exports={VERSION,COOLING_HOURS,kind,amount,period,change,remaining,enforce};
