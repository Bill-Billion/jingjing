import { uuid } from '@/business/model'

type Dict=Record<string,unknown>
const object=(v:unknown):v is Dict=>!!v&&typeof v==='object'&&!Array.isArray(v)
const fields=(v:Dict,names:string[])=>Object.keys(v).every(k=>names.includes(k))
const tokenPattern=/^[a-f0-9-]{36}\.[a-f0-9]{64}$/
export const validToken=(v:unknown):v is string=>typeof v==='string'&&tokenPattern.test(v)&&uuid(v.slice(0,36))
export function parseInvite(value:string,origin:string):string|null {
 const input=value.trim()
 if(validToken(input))return input
 try {const url=new URL(input);if(url.origin!==origin||url.pathname!=='/cocreation/invitations'||url.search||!url.hash.startsWith('#invite='))return null;const token=url.hash.slice(8);return validToken(token)?token:null} catch{return null}
}
export interface Link {id:string;room_id:string;current_status:'ACTIVE'|'CLAIMED'|'REVOKED';object_version:number;expires_at:string}
export interface Created extends Link {token:string;participation_required:true}
export function isLink(v:unknown,room:string):v is Link{return object(v)&&fields(v,['id','room_id','current_status','object_version','expires_at'])&&uuid(v.id)&&v.room_id===room&&['ACTIVE','CLAIMED','REVOKED'].includes(String(v.current_status))&&Number.isSafeInteger(v.object_version)&&Number(v.object_version)>0&&typeof v.expires_at==='string'&&Number.isFinite(Date.parse(v.expires_at))}
export function isCreated(v:unknown,room:string):v is Created {if(!object(v)||!fields(v,['id','room_id','current_status','object_version','expires_at','token','participation_required']))return false;const {token,participation_required,...rest}=v;return isLink(rest,room)&&rest.current_status==='ACTIVE'&&validToken(token)&&token.startsWith(rest.id+'.')&&participation_required===true}
export interface Claim {invitation_id:string;room_id:string;person_id:string;current_status:'INVITED';participation_required:true}
export function isClaim(v:unknown,person:string):v is Claim{return object(v)&&fields(v,['invitation_id','room_id','person_id','current_status','participation_required'])&&uuid(v.invitation_id)&&uuid(v.room_id)&&v.person_id===person&&uuid(v.person_id)&&v.current_status==='INVITED'&&v.participation_required===true}
export type Pending={kind:'create';account:string;party:string;key:string;room:string;version:number}|{kind:'revoke';account:string;party:string;key:string;room:string;link:string;version:number}|{kind:'claim';account:string;party:string;key:string;person:string;tokenDigest:string}
export function isPending(v:unknown):v is Pending {if(!object(v)||!uuid(v.account)||!uuid(v.party)||!uuid(v.key))return false;switch(v.kind){case 'create':return fields(v,['kind','account','party','key','room','version'])&&uuid(v.room)&&Number.isSafeInteger(v.version)&&Number(v.version)>0;case 'revoke':return fields(v,['kind','account','party','key','room','link','version'])&&uuid(v.room)&&uuid(v.link)&&Number.isSafeInteger(v.version)&&Number(v.version)>0;case 'claim':return fields(v,['kind','account','party','key','person','tokenDigest'])&&uuid(v.person)&&typeof v.tokenDigest==='string'&&/^[a-f0-9]{64}$/.test(v.tokenDigest);default:return false}}
export async function tokenDigest(token:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
let fragmentSecret:string|null=null
/** A token is held only while navigating to the signed-in page; never in a login URL. */
export function captureFragment(hash:string){const value=hash.startsWith('#invite=')?hash.slice(8):'';fragmentSecret=validToken(value)?value:null}
export function consumeFragment(){const value=fragmentSecret;fragmentSecret=null;return value}
export function clearFragment(){fragmentSecret=null}
