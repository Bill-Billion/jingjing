// 批量修复SQL双引号问题：= "active" -> = 'active'
const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, 'routes'),
  path.join(__dirname, 'utils'),
  path.join(__dirname, 'middleware'),
  path.join(__dirname, 'services'),
  path.join(__dirname, 'jobs'),
];

let fixed = 0;
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const fp = path.join(dir, f);
    let content = fs.readFileSync(fp, 'utf8');
    // 替换 SQL 中的 ="word" 或 = "word" 为 ='word'
    const newContent = content.replace(/=\s*"([a-z_]+)"/g, "='$1'");
    if (content !== newContent) {
      fs.writeFileSync(fp, newContent, 'utf8');
      fixed++;
      console.log('修复:', f);
    }
  }
}
console.log(`共修复 ${fixed} 个文件`);
