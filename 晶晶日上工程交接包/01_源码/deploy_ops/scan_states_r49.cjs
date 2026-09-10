const fs = require('fs');
const path = require('path');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages';
function walk(d, out=[]) {
  for (const e of fs.readdirSync(d, {withFileTypes:true})) {
    const p = path.join(d,e.name);
    if (e.isDirectory()) walk(p,out);
    else if (e.name.endsWith('.dart')) out.push(p);
  }
  return out;
}
const files = walk(root);
const rows = [];
for (const f of files) {
  const s = fs.readFileSync(f,'utf8');
  const net = /ApiService\(\)\.(get|fetch|list|load|sync)|await ApiService/.test(s);
  const hasLoad = /_loading|isLoading|_sending|_submitting/.test(s);
  const hasErr = /_error|ErrorView|errorWidget|catch\s*\(/.test(s);
  const hasEmpty = /EmptyView|isEmpty\)|暂无|空空如也/.test(s);
  const hasSk = /Skeleton|_buildSkeleton/.test(s);
  const hasRefresh = /RefreshIndicator/.test(s);
  // 只关心“自己发网络请求取列表/数据”的页面
  if (net) {
    const miss = [];
    if (!hasErr) miss.push('错');
    if (!hasEmpty) miss.push('空');
    if (!hasSk && !hasLoad) miss.push('骨架/loading');
    rows.push({f: path.relative(root,f).replace(/\\/g,'/'), net, hasLoad, hasErr, hasEmpty, hasSk, hasRefresh, miss: miss.join(',')});
  }
}
console.log('网络页面数:', rows.length);
console.log('file | load err empty skel refresh | 缺');
for (const r of rows) {
  console.log([r.f, `${r.hasLoad?1:0}${r.hasErr?1:0}${r.hasEmpty?1:0}${r.hasSk?1:0}${r.hasRefresh?1:0}`, r.miss||'OK'].join(' | '));
}
