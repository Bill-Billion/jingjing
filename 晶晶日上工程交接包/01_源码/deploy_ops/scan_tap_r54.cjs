const fs = require('fs'), path = require('path');
const root = 'lib';
let total = 0;
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (f.endsWith('.dart')) {
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((l, i) => {
        // GestureDetector / InkWell 直接承担点击（疑似本该 PressScale 的可点装饰）
        if (/GestureDetector\(|InkWell\(/.test(l)) {
          total++;
          console.log(p.replace(/\\/g, '/').replace('lib/', '') + ':' + (i + 1) + '  ' + l.trim().slice(0, 95));
        }
      });
    }
  }
}
walk(root);
console.log('--- TOTAL', total);
