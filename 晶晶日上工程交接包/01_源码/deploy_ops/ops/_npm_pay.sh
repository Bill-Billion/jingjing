#!/bin/bash
set -e
cd /opt/jjsr
echo '== npm install alipay-sdk (incremental, pure JS, better-sqlite3 untouched) =='
npm i alipay-sdk@4.14.0 --no-audit --no-fund --omit=dev 2>&1 | tail -20
echo '== verify version =='
node -e 'console.log("alipay-sdk", require("alipay-sdk/package.json").version)'
echo '== better-sqlite3 still loadable =='
node -e 'const D=require("better-sqlite3");const d=new D(":memory:");console.log("better-sqlite3 ok",d.prepare("select 1 x").get().x);d.close()'
echo '== DONE NPM =='
