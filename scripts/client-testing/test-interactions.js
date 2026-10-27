// Included only in the explicit acceptance host. No provider credentials in browser.
window.jxSimulate=(kind,record='')=>new Promise(resolve=>{
 const id=crypto.randomUUID();let timer;const receive=e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='jx-simulate-result'||e.data.id!==id)return;clearTimeout(timer);removeEventListener('message',receive);resolve(e.data.state);};
 addEventListener('message',receive);timer=setTimeout(()=>{removeEventListener('message',receive);resolve('CANCEL');},180000);
 if(parent===window){clearTimeout(timer);removeEventListener('message',receive);resolve('CANCEL');return;}parent.postMessage({type:'jx-simulate',kind,id,record},location.origin);
});
