// 第71轮 A1 横向复扫：找仍在直接使用的旧 Material 控件（可能未曜石化）
const fs = require('fs');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib';
const defs = [
  ['ChoiceChip', /\bChoiceChip\s*\(/],
  ['FilterChip', /\bFilterChip\s*\(/],
  ['Stepper', /\bStepper\s*\(/],
  ['OutlinedButton', /\bOutlinedButton\s*\(/],
  ['ElevatedButton', /\bElevatedButton\s*\(/],
  ['RawMaterialButton', /\bRawMaterialButton\s*\(/],
  ['MaterialButton', /\bMaterialButton\s*\(/],
  ['FloatingActionButton', /\bFloatingActionButton\s*\(/],
  ['LinearProgressIndicator', /\bLinearProgressIndicator\s*\(/],
  ['CircularProgressIndicator', /\bCircularProgressIndicator\s*\(/],
  ['Slider', /\bSlider\s*\(/],
  ['Switch', /\bSwitch\s*\(/],
  ['Checkbox', /\bCheckbox\s*\(/],
  ['Radio', /\bRadio\s*[<(]/],
  ['TextField', /\bTextField\s*\(/],
  ['TextFormField', /\bTextFormField\s*\(/],
  ['Divider', /\bDivider\s*\(/],
  ['SnackBar', /\bSnackBar\s*\(/],
  ['BottomNavigationBar', /\bBottomNavigationBar\s*\(/],
  ['TabBar', /\bTabBar\s*\(/],
  ['OutlineInputBorder', /\bOutlineInputBorder\s*\(/],
];
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())r=r.concat(walk(p));else if(e.name.endsWith('.dart'))r.push(p);}return r;}
const hits = {};
for(const f of walk(root)){
  const lines = fs.readFileSync(f,'utf8').split(/\r?\n/);
  lines.forEach((l,i)=>{
    const t = l.trim();
    if(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    for(const [name,p] of defs){ if(p.test(l)){ (hits[name]??=[]).push(f.replace(root,'')+':'+(i+1)+'  '+t.slice(0,95)); } }
  });
}
let total=0;
for(const [name] of defs){ const arr=hits[name]; if(!arr) continue; total+=arr.length; console.log('\n### '+name+' ('+arr.length+')'); arr.slice(0,50).forEach(x=>console.log('  '+x)); }
console.log('\n=== TOTAL raw matches:', total);
