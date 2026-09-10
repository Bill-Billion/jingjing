// 第72轮 A5 三态横向自审：逐页统计 loading / empty / error-retry / 是否有网络请求
const fs = require('fs');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages';
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())r=r.concat(walk(p));else if(e.name.endsWith('.dart'))r.push(p);}return r;}
const rows=[];
for(const f of walk(root)){
  const s=fs.readFileSync(f,'utf8');
  const net = /ApiService|http\.|FutureBuilder|StreamBuilder|\.get\(|\.post\(|fetch|loadData|_load/.test(s);
  const loading = /CircularProgressIndicator|isLoading|_loading|加载中|Skeleton|shimmer|Shimmer/.test(s);
  const empty = /暂无|空空|isEmpty|EmptyState|emptyText|没有|还未|去逛逛|EmptyBlock/.test(s);
  const retry = /重试|重新加载|onRetry|_retry|retry|加载失败|网络异常|稍后再试|再试一次|errorText|_error\b|hasError/.test(s);
  rows.push({f:f.replace(root+'/',''), net, loading, empty, retry,
    // 粗略行数
    n: s.split(/\r?\n/).length});
}
// 只重点看“有网络/异步数据”的页面
console.log('页面 | 行数 | net | load | empty | retry');
for(const r of rows.sort((a,b)=>a.f.localeCompare(b.f))){
  const flag = (r.net && (!r.retry||!r.empty||!r.loading)) ? '  <<< 需看' : '';
  console.log(`${r.net?'N':'-'} L${String(r.loading?1:0)} E${r.empty?1:0} R${r.retry?1:0} ${String(r.n).padStart(4)} ${r.f}${flag}`);
}
const need = rows.filter(r=>r.net&&(!r.retry||!r.empty||!r.loading));
console.log('\n=== 有异步数据但三态不全的页面数:', need.length);
need.forEach(r=>console.log('  ',r.f,'缺:',[!r.loading&&'loading',!r.empty&&'empty',!r.retry&&'retry'].filter(Boolean).join(',')));
