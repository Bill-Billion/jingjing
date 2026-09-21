'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
// Do not use global Node discovery: legacy scripts/*_test.js can start services or probe providers.
const files=fs.readdirSync(path.join(root,'test')).filter(n=>/\.test\.(cjs|mjs|js)$/.test(n)).sort().map(n=>'test/'+n);
if (!files.length) throw new Error('No backend test files found');
const env={...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,'--require ./scripts/test-network-guard.cjs'].filter(Boolean).join(' ')};
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,env,stdio:'inherit',windowsHide:true});
process.exit(result.status===null?1:result.status);
