const fs = require('fs');
const lines = fs.readFileSync('/opt/jjsr/routes/projects.js', 'utf8').split('\n');
for (let n = 12; n < 42; n++) {
  const l = lines[n] || '';
  const bad = [];
  for (let k = 0; k < l.length; k++) {
    const c = l.charCodeAt(k);
    if (c === 0x200b || c === 0x00a0 || c === 0xfeff || c === 0x3000 || c === 0xff08 || c === 0xff09 || c === 0xff0c || (c >= 0x2000 && c <= 0x200a)) {
      bad.push(k + ':U+' + c.toString(16).toUpperCase());
    }
  }
  if (bad.length) console.log('line ' + (n + 1) + ' >> ' + bad.join('  '));
}
// 直接把第15行(列表SQL首行)每个字符码点打出来核对
console.log('--- line15 codes ---');
const l15 = lines[14] || '';
console.log(JSON.stringify(l15));
console.log('--- line16 codes ---');
console.log(JSON.stringify(lines[15] || ''));
console.log('done');
