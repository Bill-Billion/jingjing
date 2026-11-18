// Native widgets, real Android file picker, isolated HTTP/MySQL and Vue operator.
import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'.local/pr39-artists-native'),app=resolve(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app')
assert(process.env.JX_MYSQL_TEST_ENV_FILE,'JX_MYSQL_TEST_ENV_FILE is required')
const adb=process.env.ADB_PATH||'adb',device=process.env.NATIVE_DEVICE_ID||'emulator-5554',flutter=process.env.FLUTTER_BIN||'flutter'
await mkdir(out,{recursive:true})
const child=spawn(process.execPath,[resolve(root,'scripts/pr39-artists-native-controller.mjs')],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']})
const ended=new Promise(resolve=>child.once('exit',resolve));child.stderr.pipe(process.stderr)
let port
try {
 port=await new Promise((yes,no)=>{let text='';const timer=setTimeout(()=>no(Error('Native controller startup timeout')),60000);child.stdout.on('data',b=>{process.stdout.write(b);text+=b;const match=text.match(/READY (\d+)/);if(match){clearTimeout(timer);yes(Number(match[1]))}});child.once('exit',code=>{clearTimeout(timer);no(Error('Native controller exited '+code))})})
 execFileSync(adb,['-s',device,'reverse',`tcp:${port}`,`tcp:${port}`])
 const file=resolve(out,'pr39-synthetic.png');await writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64'))
 execFileSync(adb,['-s',device,'push',file,'/sdcard/Download/pr39-synthetic.png'])
 const run=spawn(flutter,['test','integration_test/pr39_artists_native_local_test.dart','-d',device,'--no-pub','--timeout','25m',`--dart-define-from-file=${resolve(out,'defines.json')}`,'--reporter','expanded'],{cwd:app,env:process.env,stdio:'inherit'})
 const code=await new Promise((yes,no)=>{run.once('error',no);run.once('exit',yes)});assert.equal(code,0,'Native integration test failed')
 const result=JSON.parse(await readFile(resolve(out,'results.json')));assert(result.completed&&result.checks.length>=12)
 console.log('PASS native certification/free services, four client roles and independent Vue reviewer')
} finally {
 if(child.exitCode===null)child.kill('SIGTERM');await ended
 if(port)execFileSync(adb,['-s',device,'reverse','--remove',`tcp:${port}`])
 await unlink(resolve(out,'defines.json')).catch(e=>{if(e.code!=='ENOENT')throw e})
}
