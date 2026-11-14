'use strict';
const path=require('node:path'),{spawn}=require('node:child_process');
function adbPath(root){return process.env.ADB_BIN||process.env.ADB_PATH||(process.platform==='win32'?'J:\\.local\\tools\\android-sdk\\platform-tools\\adb.exe':path.resolve(root,'../toolchains/android-sdk/platform-tools/adb'));}
function runNative({root,test,device,defines,timeout='15m'}){
 if(!/^emulator-\d+$/.test(device)||!/^integration_test\/[a-z0-9_]+\.dart$/.test(test))throw Error('ISOLATED_NATIVE_TEST_REQUIRED');
 const app=path.resolve(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app');
 if(process.platform==='win32')return spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/run-native-test.ps1'),'-AppRoot',app,'-Target',test,'-Device',device,'-Defines',defines,'-Timeout',timeout],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
 const tc=path.resolve(process.env.JX_TOOLCHAINS_HOME||path.join(root,'../toolchains')),env={...process.env,PUB_CACHE:path.join(tc,'pub-cache'),ANDROID_HOME:path.join(tc,'android-sdk'),ANDROID_USER_HOME:path.join(tc,'android-user'),ANDROID_AVD_HOME:path.join(tc,'avd'),GRADLE_USER_HOME:path.join(tc,'gradle'),JAVA_HOME:path.join(tc,'jdk17/jdk-17.0.21+9/Contents/Home'),FLUTTER_SUPPRESS_ANALYTICS:'true'};
 env.PATH=[path.join(tc,'flutter/bin'),path.join(env.JAVA_HOME,'bin'),path.join(tc,'android-sdk/platform-tools'),process.env.PATH].join(path.delimiter);
 return spawn(process.env.FLUTTER_BIN||path.join(tc,'flutter/bin/flutter'),['test',test,'-d',device,'--no-pub','--timeout',timeout,'--dart-define-from-file='+defines,'--reporter','expanded'],{cwd:app,env,stdio:'inherit'});
}
module.exports={adbPath,runNative};
