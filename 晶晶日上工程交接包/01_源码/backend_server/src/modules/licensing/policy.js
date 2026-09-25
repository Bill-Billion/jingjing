 'use strict';
const {shape,label,error}=require('../party/policy');
const {canonical}=require('../governance/content');
const RIGHTS=['ADAPT','PRODUCE','DISTRIBUTE','PROMOTE','SEQUEL','AI_PROCESS','AI_TRAIN'];
const PURPOSES=['PRIVATE','PUBLIC_SHARE','COMMERCIAL','RELEASE'];
function instant(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)throw error('INVALID_INSTANT',400);return Date.parse(v);}
function list(v,check){if(!Array.isArray(v)||!v.length||v.length>100||new Set(v).size!==v.length||v.some(x=>!check(x)))throw error('INVALID_SCOPE',400);}
function terms(input){const v=JSON.parse(canonical(input));shape(v,['exclusive','rights','purposes','territories','languages','valid_from','valid_until','development_until','project_limit','episode_limit','terms_text']);
 if(typeof v.exclusive!=='boolean')throw error('INVALID_SCOPE',400);
 list(v.rights,x=>RIGHTS.includes(x));list(v.purposes,x=>PURPOSES.includes(x));list(v.territories,x=>typeof x==='string'&&/^(WORLD|[A-Z]{2})$/.test(x));list(v.languages,x=>typeof x==='string'&&/^(ALL|[a-z]{2})$/.test(x));
 if(instant(v.valid_from)>=instant(v.valid_until)||instant(v.development_until)<=instant(v.valid_from)||instant(v.development_until)>instant(v.valid_until))throw error('INVALID_PERIOD',400);
 for(const key of ['project_limit','episode_limit'])if(!Number.isInteger(v[key])||v[key]<1||v[key]>100000)throw error('INVALID_QUOTA',400);
 label(v.terms_text,8000);return v;
}
const intersects=(a,b,wild)=>a.some(x=>b.includes(x))||!!(wild&&(a.includes(wild)||b.includes(wild)));
function conflict(a,b){a=terms(a);b=terms(b);return (a.exclusive||b.exclusive)&&instant(a.valid_from)<instant(b.valid_until)&&instant(b.valid_from)<instant(a.valid_until)&&intersects(a.rights,b.rights)&&intersects(a.purposes,b.purposes)&&intersects(a.territories,b.territories,'WORLD')&&intersects(a.languages,b.languages,'ALL');}
function projectScope(t,p,now){t=terms(t);shape(p,['title','purpose','territory','language','episodes']);label(p.title,200);if(!PURPOSES.includes(p.purpose)||!/^([A-Z]{2})$/.test(p.territory)||!/^([a-z]{2})$/.test(p.language)||!Number.isInteger(p.episodes)||p.episodes<1)throw error('INVALID_PROJECT',400);
 return now>=instant(t.valid_from)&&now<instant(t.development_until)&&p.episodes<=t.episode_limit&&t.purposes.includes(p.purpose)&&(t.territories.includes('WORLD')||t.territories.includes(p.territory))&&(t.languages.includes('ALL')||t.languages.includes(p.language));}
function price(v){shape(v,['currency','amount_minor']);if(typeof v.currency!=='string'||!/^[A-Z]{3}$/.test(v.currency)||!Number.isSafeInteger(v.amount_minor)||v.amount_minor<0)throw error('INVALID_PRICE',400);return v;}
module.exports={terms,conflict,instant,projectScope,price,RIGHTS,PURPOSES};
