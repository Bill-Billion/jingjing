// 枚举后端全部路由（方法/路径/是否带 auth 中间件），用于接口清单与冒烟
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', '..', 'server', 'server', 'routes');
const files = fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort();
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = l.match(/router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/);
    if (m) {
      const head = lines.slice(Math.max(0, i - 2), i + 1).join(' ');
      const needAuth = /(^|[^a-zA-Z])(auth|adminAuth)\s*[,\)]/.test(head) ? 'AUTH' : 'pub ';
      console.log([f.replace('.js', ''), m[1].toUpperCase().padEnd(6), m[2], needAuth].join('\t'));
    }
  });
}
