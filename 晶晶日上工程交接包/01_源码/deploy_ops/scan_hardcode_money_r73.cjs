// 第73轮：全 lib 复扫“写死金额”（不只 pages，含 widgets/utils/services/models）
const fs = require('fs');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib';
// 允许出现固定金额的白名单
const allow = ['utils/pricing.dart','utils/money.dart'];
// 命中：¥后跟数字；或字符串里直接出现 99/4901/5000/1999/19999/200/1000/500 等定价数字（带¥或“元/意向金/制作款/保证金”语境）
const reYen = /[¥￥]\s?\d[\d,]*(?:\.\d+)?/;
const priceNums = [99,4901,5000,1999,19999,200,1000,500];
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())r=r.concat(walk(p));else if(e.name.endsWith('.dart'))r.push(p);}return r;}
let hits=0;
for(const f of walk(root)){
  const rel=f.replace(root+'/','').replace(/\\/g,'/');
  if(allow.some(a=>rel.endsWith(a))) continue;
  const lines=fs.readFileSync(f,'utf8').split(/\r?\n/);
  lines.forEach((l,i)=>{
    const t=l.trim();
    if(t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))return;
    let flag=null;
    if(reYen.test(l)) flag='YEN: '+t.slice(0,110);
    else {
      // 字符串字面量内出现定价数字（排除 Duration/尺寸/颜色/权重/行数等）
      const m=l.match(/'([^']*\d[^']*)'|"([^"]*\d[^"]*)"/);
      if(m){
        const str=m[1]||m[2]||'';
        for(const n of priceNums){
          const re=new RegExp('(^|[^\\d.])'+n+'([^\\d]|$)');
          if(re.test(str) && /元|价|金|费|款|保证金|意向|¥|块|万|千/.test(str)){ flag='NUM'+n+': '+t.slice(0,110); break; }
        }
      }
    }
    if(flag){hits++;console.log(rel+':'+(i+1)+'  '+flag);}
  });
}
console.log('\n=== 写死金额候选命中:',hits,'（已白名单 pricing/money）');
