const fs = require('fs');
const path = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/晶晶日上_整体开发报告与下一阶段计划_20260905.md';
const out  = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/晶晶日上_整体开发报告与下一阶段计划_20260905.html';
let md = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const lines = md.split('\n');

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function inline(s){
  s = esc(s);
  s = s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,'<a href="$2">$1</a>');
  s = s.replace(/(https?:\/\/[^\s<)]+)/g,'<a href="$1">$1</a>');
  return s;
}

let html=[], i=0;
function listType(l){ const t=l.trim(); if(/^\d+\.\s/.test(t)) return 'ol'; if(/^[-*]\s/.test(t)) return 'ul'; return null;}
function stripBullet(l){return l.trim().replace(/^(\d+\.|[-*])\s+/,'');}

while(i<lines.length){
  let l=lines[i];
  // code fence
  if(/^```/.test(l.trim())){
    i++; let buf=[];
    while(i<lines.length && !/^```/.test(lines[i].trim())){buf.push(esc(lines[i]));i++;}
    i++; html.push('<pre><code>'+buf.join('\n')+'</code></pre>'); continue;
  }
  // table block
  if(l.trim().startsWith('|') && i+1<lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){
    let header=l.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
    i+=2; let rows=[];
    while(i<lines.length && lines[i].trim().startsWith('|')){
      rows.push(lines[i].trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim())); i++;
    }
    let t='<table><thead><tr>'+header.map(h=>'<th>'+inline(h)+'</th>').join('')+'</tr></thead><tbody>';
    for(const r of rows){t+='<tr>'+header.map((_,k)=>'<td>'+inline(r[k]||'')+'</td>').join('')+'</tr>';}
    t+='</tbody></table>'; html.push(t); continue;
  }
  // headings
  let hm=l.match(/^(#{1,4})\s+(.*)$/);
  if(hm){const lv=hm[1].length; html.push(`<h${lv}>${inline(hm[2])}</h${lv}>`);i++;continue;}
  // hr
  if(/^---+\s*$/.test(l)){html.push('<hr/>');i++;continue;}
  // blockquote (group consecutive >)
  if(/^>\s?/.test(l)){
    let buf=[];
    while(i<lines.length && /^>\s?/.test(lines[i])){buf.push(lines[i].replace(/^>\s?/,''));i++;}
    html.push('<blockquote>'+buf.map(x=>x.trim()===''?'<br/>':inline(x)).join('<br/>')+'</blockquote>'); continue;
  }
  // lists (group consecutive, support one nested level by indent)
  let lt=listType(l);
  if(lt){
    let stack=[];
    const open=(t)=>{html.push('<'+t+'>');stack.push(t);};
    const close=()=>{const t=stack.pop();html.push('</'+t+'>');};
    let prevIndent=-1;
    while(i<lines.length && (listType(lines[i]) || lines[i].trim()==='')){
      if(lines[i].trim()===''){ // peek: list continues after blank?
        if(i+1<lines.length && listType(lines[i+1])){i++;continue;} break;
      }
      const indent=lines[i].match(/^\s*/)[0].length;
      const t=listType(lines[i]);
      if(prevIndent===-1){open(t);prevIndent=indent;}
      else if(indent>prevIndent){open(t);prevIndent=indent;}
      else if(indent<prevIndent){close(); while(stack.length && indent<prevIndent){close();} if(!stack.length)open(t); prevIndent=indent;}
      else { const cur=stack[stack.length-1]; if(cur!==t){close();open(t);} }
      let item=stripBullet(lines[i]).replace(/^\[\s\]/g,'<span class="cb"></span>');
      html.push('<li>'+inline(item)+'</li>');
      i++;
    }
    while(stack.length)close();
    continue;
  }
  // blank
  if(l.trim()===''){i++;continue;}
  // paragraph (gather until blank/block start)
  let buf=[l]; i++;
  while(i<lines.length && lines[i].trim()!=='' && !/^(#{1,4})\s/.test(lines[i]) && !/^```/.test(lines[i]) && !lines[i].trim().startsWith('|') && !/^>/.test(lines[i]) && !listType(lines[i]) && !/^---+/.test(lines[i])){buf.push(lines[i]);i++;}
  html.push('<p>'+buf.map(inline).join('<br/>')+'</p>');
}

const body=html.join('\n');
const doc=`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>晶晶日上 整体开发报告与下一阶段计划</title>
<style>
:root{--ink:#1c2438;--sub:#5b6577;--gold:#b8893a;--line:#e6e1d6;--bg:#f6f4ef;--card:#fff;--accent:#0e1320;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;line-height:1.78;font-size:16px;}
.wrap{max-width:880px;margin:0 auto;padding:28px 18px 80px;}
h1{font-size:26px;line-height:1.4;color:var(--accent);border-bottom:3px solid var(--gold);padding-bottom:14px;margin:8px 0 20px;}
h2{font-size:21px;color:var(--accent);margin:34px 0 14px;padding-left:11px;border-left:5px solid var(--gold);}
h3{font-size:17.5px;color:#2a3349;margin:24px 0 10px;}
h4{font-size:16px;color:#333c52;margin:18px 0 8px;}
p{margin:10px 0;}
a{color:#0b63c7;word-break:break-all;}
strong{color:#11182b;}
code{background:#efece4;color:#8a5a12;padding:1px 6px;border-radius:5px;font-size:.88em;font-family:ui-monospace,Consolas,Menlo,monospace;}
pre{background:#0e1320;color:#d7deec;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:13px;line-height:1.6;}
pre code{background:none;color:inherit;padding:0;}
blockquote{margin:14px 0;padding:12px 16px;background:#fbf7ec;border-left:4px solid var(--gold);color:#4a463c;border-radius:0 8px 8px 0;font-size:15px;}
hr{border:none;border-top:1px solid var(--line);margin:26px 0;}
table{border-collapse:collapse;width:100%;margin:14px 0;background:var(--card);font-size:14.5px;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);display:block;overflow-x:auto;}
th,td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top;}
th{background:var(--accent);color:#f0e6cf;font-weight:600;white-space:nowrap;}
tbody tr:nth-child(even){background:#faf8f3;}
ul,ol{padding-left:24px;margin:10px 0;}
li{margin:5px 0;}
.cb{display:inline-block;width:13px;height:13px;border:1.5px solid var(--gold);border-radius:3px;margin-right:7px;vertical-align:-2px;}
@media(max-width:560px){body{font-size:15px;}.wrap{padding:18px 13px 60px;}h1{font-size:22px;}h2{font-size:19px;}table{font-size:13px;}}
</style></head>
<body><div class="wrap">
${body}
</div></body></html>`;
fs.writeFileSync(out,doc,'utf8');
console.log('HTML_OK bytes='+Buffer.byteLength(doc,'utf8'));
