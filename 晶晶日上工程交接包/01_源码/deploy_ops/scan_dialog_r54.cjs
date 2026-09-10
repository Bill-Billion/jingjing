const fs = require('fs'), path = require('path');
const root = 'lib';
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (f.endsWith('.dart')) {
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((l, i) => {
        if (/showDialog\(|AlertDialog|Dialog\(|showModalBottomSheet\(|SnackBar\(/.test(l)) {
          console.log(p.replace(/\\/g, '/').replace('lib/', '') + ':' + (i + 1) + '  ' + l.trim().slice(0, 105));
        }
      });
    }
  }
}
walk(root);
