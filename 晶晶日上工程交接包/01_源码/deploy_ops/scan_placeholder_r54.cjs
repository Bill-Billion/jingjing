const fs = require('fs'), path = require('path');
const root = 'lib';
// 测试占位/假数据残留：测试手机号、测试邮箱、Lorem、foo/bar/asdf、连续123456、张三李四某某、xxx
const phone = /1[3-9]\d{9}/;
const re = /[Ll]orem|test@|example\.(com|cn)|foo|bar|asdf|123456|张三|李四|王五|某某|xxx|XXX|占位|假数据|测试数据|dummy|placeholder\s*[:=]/;
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (f.endsWith('.dart')) {
      fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
        if (phone.test(l) || re.test(l)) {
          console.log(p.replace(/\\/g, '/').replace('lib/', '') + ':' + (i + 1) + '  ' + l.trim().slice(0, 120));
        }
      });
    }
  }
}
walk(root);
