// 更全面的SQL双引号修复
const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, 'routes'),
  path.join(__dirname, 'utils'),
  path.join(__dirname, 'middleware'),
  path.join(__dirname, 'services'),
  path.join(__dirname, 'jobs'),
  path.join(__dirname, 'db.js'),
  path.join(__dirname, 'seed.js'),
];

let fixed = 0;
function processFile(fp) {
  let content = fs.readFileSync(fp, 'utf8');
  const original = content;
  
  // 1. = "word" -> = 'word'
  content = content.replace(/=\s*"([a-z_]+)"/g, "='$1'");
  
  // 2. IN ("a", "b") -> IN ('a', 'b')
  content = content.replace(/IN\s*\(\s*"([^"]+)"((?:\s*,\s*"[^"]+")*)\s*\)/gi, (m, first, rest) => {
    let result = "IN ('" + first + "'";
    if (rest) {
      const others = rest.match(/"([^"]+)"/g);
      if (others) result += others.map(o => ", '" + o.slice(1,-1) + "'").join('');
    }
    return result + ')';
  });
  
  // 3. SET col = "word" -> SET col = 'word' (already covered by #1)
  
  // 4. VALUES 中的双引号字符串 - 只替换SQL语句中的
  // 这个比较危险，跳过，因为VALUES可能在JS对象中
  
  if (content !== original) {
    fs.writeFileSync(fp, content, 'utf8');
    fixed++;
    console.log('修复:', path.basename(fp));
  }
}

for (const d of dirs) {
  if (typeof d === 'string' && d.endsWith('.js')) {
    if (fs.existsSync(d)) processFile(d);
  } else if (fs.existsSync(d)) {
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.js')) processFile(path.join(d, f));
    }
  }
}
console.log(`共修复 ${fixed} 个文件`);
