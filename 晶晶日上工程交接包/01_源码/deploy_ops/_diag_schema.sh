#!/bin/bash
echo '=== PM2 ==='
pm2 list 2>/dev/null | sed -n '1,20p'
echo '=== project_roles schema (node) ==='
cd /opt/jjsr
node -e '
const D=require("better-sqlite3");
const db=new D("/opt/jjsr/jingjingshangri.db");
const row=db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get("project_roles");
console.log("DDL:", row && row.sql);
console.log("COLS:", db.prepare("PRAGMA table_info(project_roles)").all().map(c=>c.name).join(","));
const h=db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get("humans");
console.log("HUMANS_COLS:", db.prepare("PRAGMA table_info(humans)").all().map(c=>c.name).join(","));
db.close();
'
echo '=== md5 + size of online route files ==='
md5sum /opt/jjsr/routes/projects.js /opt/jjsr/routes/humans.js /opt/jjsr/routes/samples.js /opt/jjsr/db.js
wc -c /opt/jjsr/routes/projects.js /opt/jjsr/routes/humans.js /opt/jjsr/routes/samples.js /opt/jjsr/db.js
echo '=== health local ==='
curl -s -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:3000/api/health
echo '=== projects api local ==='
curl -s "http://127.0.0.1:3000/api/projects?page=1&pageSize=2" | head -c 600
echo
