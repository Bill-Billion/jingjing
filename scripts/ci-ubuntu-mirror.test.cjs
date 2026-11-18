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

test('Canonical host outage may use the recognized independent Kernel.org mirror without changing apt trust',()=>{
 const seen=[],selected=selectMirror('noble',u=>{seen.push(u);return u.startsWith('https://mirrors.us.kernel.org/');});
 assert.equal(selected,'https://mirrors.us.kernel.org/ubuntu');assert.equal(seen.length,4);
 assert.equal(rewriteSources('deb https://archive.ubuntu.com/ubuntu noble main',selected),'deb https://mirrors.us.kernel.org/ubuntu/ noble main');
 assert.equal(rewriteSources('deb https://mirrors.us.kernel.org/ubuntu/ noble main','https://archive.ubuntu.com/ubuntu'),'deb https://archive.ubuntu.com/ubuntu/ noble main');
});

test('PR40 AWS runner regional mirror list follows the successfully probed mirror',()=>{
 const input='http://us-east-2.ec2.archive.ubuntu.com/ubuntu priority:1\nhttps://archive.ubuntu.com/ubuntu priority:2\n';
 const selected=selectMirror('noble',u=>u.startsWith('https://archive.ubuntu.com/'));
 assert.equal(rewriteSources(input,selected),'https://archive.ubuntu.com/ubuntu/ priority:1\nhttps://archive.ubuntu.com/ubuntu/ priority:2\n');
});

test('regional deb822 sources retain signed suites and components',()=>{
 const input='Types: deb\nURIs: http://us-west-2.ec2.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-backports\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
 assert.equal(rewriteSources(input,'https://mirrors.us.kernel.org/ubuntu'),input.replace('http://us-west-2.ec2.archive.ubuntu.com/ubuntu/','https://mirrors.us.kernel.org/ubuntu/'));
});

test('nearby domains, userinfo, query strings and other archive paths stay unchanged',()=>{
 const input=[
  'https://archive.ubuntu.com.evil.invalid/ubuntu',
  'https://us-east-2.ec2.archive.ubuntu.com.evil.invalid/ubuntu',
  'https://archive.ubuntu.com/ubuntu-ports',
  'https://archive.ubuntu.com/ubuntu?source=test',
  'https://unknown.invalid/path?url=https://archive.ubuntu.com/ubuntu',
  'https://name:password@archive.ubuntu.com/ubuntu',
  'https://packages.microsoft.com/ubuntu/24.04/prod',
 ].join('\n');
 assert.equal(rewriteSources(input,'https://azure.archive.ubuntu.com/ubuntu'),input);
});
