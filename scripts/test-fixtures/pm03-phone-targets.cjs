'use strict';
// Only the disk-backed PM03 simulator imports this. Never a real SMS provider.
const pairs=Object.freeze({buyer:'19910009001',stock_buyer:'19910009002'});
function targets(accounts){return Object.fromEntries(Object.entries(pairs).filter(([role])=>accounts[role]).map(([role,new_phone])=>[role,{new_phone}]));}
function allowed(state,phone){
 if(state.synthetic_only!==true)return false;
 if(Object.values(state.accounts||{}).some(a=>a.phone===phone))return true;
 return state.mode==='BATCH'&&Object.entries(pairs).some(([role,target])=>state.accounts?.[role]&&state.scenarios?.phone_change?.[role]?.new_phone===target&&phone===target);
}
module.exports={targets,allowed};
