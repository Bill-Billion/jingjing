'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectMirror,rewriteSources}=require('./ci-ubuntu-mirror.cjs');
test('unreachable main mirror falls back only after probing an official mirror',()=>{
 const seen=[],selected=selectMirror('noble',u=>{seen.push(u);return u.startsWith('https://azure.');});
 assert.equal(selected,'https://azure.archive.ubuntu.com/ubuntu');
 assert.deepEqual(seen,['https://archive.ubuntu.com/ubuntu/dists/noble/InRelease','https://azure.archive.ubuntu.com/ubuntu/dists/noble/InRelease']);
 assert.throws(()=>selectMirror('noble',()=>false),/NO_REACHABLE/);
 assert.throws(()=>selectMirror('noble;exit',()=>true),/SUITE_REQUIRED/);
});
test('changing mirror preserves suites, keyring and unrelated package sources',()=>{
 const input='URIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\nhttps://security.ubuntu.com/ubuntu priority:1\nhttps://packages.microsoft.com/ubuntu/24.04/prod\n';
 const value=rewriteSources(input,'https://archive.ubuntu.com/ubuntu');
 assert.equal(value,'URIs: https://archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\nhttps://archive.ubuntu.com/ubuntu/ priority:1\nhttps://packages.microsoft.com/ubuntu/24.04/prod\n');
 assert(!value.includes('trusted=yes'));assert.throws(()=>rewriteSources(input,'https://unknown.invalid/ubuntu'),/UNRECOGNIZED/);
});
