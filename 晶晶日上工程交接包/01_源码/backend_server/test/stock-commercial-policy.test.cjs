"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/stock/policy'),A=require('../src/modules/artists/policy');
const spec={version:'commercial-test',stock_license:{scope:'COMMERCIAL_LIMITED',exclusive:false,territory:'CN',duration:'FIXED_TERM',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2035-01-01T00:00:00.000Z',commercial_uses:['BRAND_PROMOTION'],personal_social_sharing:false,acceptance_hours:48,aftercare_terms:'Rights or failed delivery independently reviewed.'},terms:'Synthetic business usage only.'};
test('commercial scope is explicit, limited and never implies distribution or copyright transfer',()=>{
 const l=P.license(P.specification(spec));assert(l.excluded.includes('COMMERCIAL_ADVERTISING'));assert(l.excluded.includes('DISTRIBUTION'));assert.equal(l.exclusive,false);
 const ad=structuredClone(spec);ad.stock_license.commercial_uses.push('COMMERCIAL_ADVERTISING');assert(!P.license(P.specification(ad)).excluded.includes('COMMERCIAL_ADVERTISING'));
 for(const delta of [{exclusive:true},{commercial_uses:[]},{commercial_uses:['AI_REGENERATION']},{commercial_uses:['BRAND_PROMOTION','BRAND_PROMOTION']},{valid_until:spec.stock_license.valid_from},{duration:'PERPETUAL'},{personal_social_sharing:true}])assert.throws(()=>P.specification({...spec,stock_license:{...spec.stock_license,...delta}}));
});
test('personal consent cannot become a commercial permission; usage territory and entire term must fit',()=>{
 const c={purposes:['STOCK_LICENSE','PUBLIC_DISPLAY','STOCK_COMMERCIAL'],stock_commercial_uses:['BRAND_PROMOTION'],territories:['CN'],valid_from:'2019-01-01T00:00:00.000Z',valid_until:'2036-01-01T00:00:00.000Z'};
 P.coversConsent(spec.stock_license,c);
 for(const delta of [{purposes:['STOCK_LICENSE','PUBLIC_DISPLAY']},{stock_commercial_uses:['CORPORATE_DISPLAY']},{territories:['US']},{valid_until:'2030-01-01T00:00:00.000Z'}])assert.throws(()=>P.coversConsent(spec.stock_license,{...c,...delta}),{code:'STOCK_COMMERCIAL_CONSENT_REQUIRED'});
 assert.throws(()=>P.active(spec.stock_license,'2035-01-01T00:00:00.000Z'),{code:'STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE'});
 assert.throws(()=>P.active(spec.stock_license,'2019-01-01T00:00:00.000Z'));
 P.active({scope:'PERSONAL_NONCOMMERCIAL'},'2099-01-01T00:00:00.000Z');
});
