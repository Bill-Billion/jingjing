/** A successful manual recovery reconciles the original page's pending draft. */
export interface ConsumerRecovery {accountId:string;partyId:string;key:string;path:string;recordId:string}
const listeners=new Set<(event:ConsumerRecovery)=>void>()
export function onConsumerRecovery(f:(event:ConsumerRecovery)=>void){listeners.add(f);return()=>listeners.delete(f)}
export function publishConsumerRecovery(e:ConsumerRecovery){
 const domain=e.path.startsWith('/redemption/')?'redemption':e.path.startsWith('/wallet/')?'wallet':null
 if(domain)try{const key=`ops.business.pending.${domain}`,raw=JSON.parse(sessionStorage.getItem(key)||'null'),context=raw&&JSON.parse(raw.context);if(context?.accountId===e.accountId&&context.partyId===e.partyId&&raw.command?.key===e.key&&raw.command.path===e.path)sessionStorage.removeItem(key)}catch{/* An unrelated or malformed draft is never removed. */}
 for(const f of listeners)f(e)
}
