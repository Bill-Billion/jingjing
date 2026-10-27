// Test host only: the production client omits cookies; add this host's invitation cookie only for same-origin business requests.
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(url.origin!==location.origin||!url.pathname.startsWith('/api/v1/'))return nativeFetch(input,init);
 const opts={...init,credentials:'same-origin'},method=(opts.method||'GET').toUpperCase();
 const request=(route,body)=>nativeFetch(route,{...opts,method:'POST',body:JSON.stringify(body),headers:{...Object.fromEntries(new Headers(opts.headers)), 'Idempotency-Key':crypto.randomUUID()}});
 if(window.jxSimulate&&method==='POST'&&/^\/api\/v1\/artists\/people\/[^/]+\/identity$/.test(url.pathname)){
  const state=await window.jxSimulate('identity');if(state==='CANCEL')throw Error('已取消模拟核验');
  const session_ref='synthetic:'+new Headers(opts.headers).get('Idempotency-Key');
  const choice=await request('/api/v1/testing/identity/outcome',{person_id:url.pathname.split('/')[5],session_ref,state});if(!choice.ok)return choice;opts.body=JSON.stringify({session_ref});
 }
 const match=/^\/api\/v1\/trade\/(payments|refunds)\/([^/]+)\/reconciliation$/.exec(url.pathname);
 if(window.jxSimulate&&method==='POST'&&match){const state=await window.jxSimulate(match[1]==='payments'?'payment':'refund',match[2]);if(state!=='CANCEL'){const choice=await request('/api/v1/testing/payments/outcome',{record_id:match[2],state});if(!choice.ok)return choice;}}
 const response=await nativeFetch(input,opts);
 if(window.jxSimulate&&method==='POST'&&response.ok&&(url.pathname==='/api/v1/trade/payments'||/^\/api\/v1\/trade\/refunds\/[^/]+\/execution$/.test(url.pathname))){
  const data=(await response.clone().json()).data;
  if(data&&['PENDING','UNKNOWN'].includes(data.current_status)){
   const refund=url.pathname.includes('/refunds/'),state=await window.jxSimulate(refund?'refund':'payment',data.id);
   if(state!=='CANCEL'){const choice=await request('/api/v1/testing/payments/outcome',{record_id:data.id,state});if(!choice.ok)return choice;return request('/api/v1/trade/'+(refund?'refunds':'payments')+'/'+data.id+'/reconciliation',refund?{}:{transaction_id:null});}
  }
 }
 return response;
};
const response=await fetch('/__test/bootstrap');if(!response.ok)throw Error('测试会话不可用');const b=await response.json();if(b.synthetic_only!==true)throw Error('仅接受隔离测试');if(sessionStorage.getItem('ops.session.token')!==b.bearer_token){for(const k of Object.keys(sessionStorage))if(k.startsWith('ops.session.'))sessionStorage.removeItem(k);}sessionStorage.setItem('ops.session.token',b.bearer_token);sessionStorage.setItem('ops.session.expires_at',b.expires_at);sessionStorage.setItem('ops.session.selected',b.party_id);const entry=document.querySelector('script[data-test-entry]')?.dataset.testEntry;if(!/^\/workspace\/assets\/[A-Za-z0-9_.-]+\.js$/.test(entry||''))throw Error('网页构建入口无效');await import(entry);