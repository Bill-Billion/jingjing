// 第75轮 性能热点扫描：高斯模糊/动画控制器/重绘隔离/网络图/着色器/自绘
const fs = require('fs');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib';
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())r=r.concat(walk(p));else if(e.name.endsWith('.dart'))r.push(p);}return r;}
const keys=['BackdropFilter','AnimationController','RepaintBoundary','CachedNetworkImage','ShaderMask','CustomPaint','vsync','TickerProvider','repeat(','addPostFrameCallback','Image.asset','SvgPicture'];
const cat={};keys.forEach(k=>cat[k]=0);
const detail={};
for(const f of walk(root)){
  const s=fs.readFileSync(f,'utf8');
  for(const k of keys){
    const m=s.match(new RegExp('\\b'+k.replace('(','\\('),'g'));
    if(m){cat[k]+=m.length;(detail[k]??=[]).push(f.replace(root+'/','')+' x'+m.length);}
  }
}
console.log('=== 总计 ===');
keys.forEach(k=>console.log(k.padEnd(24),cat[k]));
for(const k of ['BackdropFilter','AnimationController','CustomPaint','ShaderMask','repeat(','CachedNetworkImage']){
  if(detail[k]){console.log('\n-- '+k+' --');detail[k].forEach(x=>console.log('  '+x));}
}
