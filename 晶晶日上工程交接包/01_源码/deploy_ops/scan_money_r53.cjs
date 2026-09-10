const fs = require('fs'), path = require('path');
const root = 'lib';
const re = /toStringAsFixed|\/\s*100\b|['"][¥￥]|元['"]|\+\s*['"]元/;
const skip = ['money.dart', 'pricing.dart', 'project_brief.dart'];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (f.endsWith('.dart') && !skip.includes(f)) {
      fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
        if (re.test(l)) console.log(p.replace(/\\/g, '/').replace('lib/', '') + ':' + (i + 1) + '  ' + l.trim().slice(0, 115));
      });
    }
  }
}
walk(root);
