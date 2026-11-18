# Drives only the Android system document picker in an isolated emulator.
import os,re,subprocess,sys,time,xml.etree.ElementTree as ET
adb,device,mode,name,out=sys.argv[1:]
assert re.fullmatch(r'emulator-[0-9]+',device)
assert mode in ('open','save','cancel')
assert re.fullmatch(r'[a-zA-Z0-9_.-]+',name)
def call(*args):
 return subprocess.check_output([adb,'-s',device,*args],stderr=subprocess.DEVNULL,text=True,encoding="utf-8",timeout=15)
def tap(node):
 n=list(map(int,re.findall(r'\d+',node.attrib['bounds'])))
 call('shell','input','tap',str((n[0]+n[2])//2),str((n[1]+n[3])//2))
seen=False;acted=False;menu=False
until=time.monotonic()+75
while time.monotonic()<until:
 time.sleep(.4)
 try:
  call('shell','uiautomator','dump','/sdcard/pm01-document-picker.xml')
  xml=call('shell','cat','/sdcard/pm01-document-picker.xml')
  nodes=list(ET.fromstring(xml).iter('node'))
 except Exception: continue
 docs=[n for n in nodes if 'documentsui' in n.attrib.get('package','')]
 if acted and not docs:
  print('DOCUMENT_PICKER_'+mode.upper()+'_RETURNED',flush=True);sys.exit(0)
 if not docs: continue
 seen=True
 if mode=='cancel':
  call('shell','input','keyevent','4');acted=True;continue
 if mode=='open':
  selected=[n for n in docs if n.attrib.get('text')==name]
  if selected:
   open(out,'w',encoding='utf8').write(xml);tap(selected[0]);acted=True;continue
 else:
  # Generated order ID filename is already supplied by the actual App.
  names=[n for n in docs if n.attrib.get('text')==name]
  saves=[n for n in docs if n.attrib.get('text','').upper() in ('SAVE','保存') and n.attrib.get('enabled')=='true']
  if names and saves:
   open(out,'w',encoding='utf8').write(xml);tap(saves[-1]);acted=True;continue
 downloads=[n for n in docs if n.attrib.get('text') in ('Downloads','下载')]
 if downloads: tap(downloads[0]);continue
 roots=[n for n in docs if n.attrib.get('content-desc') in ('Show roots','显示根目录','打开抽屉式导航栏')]
 if roots and not menu: tap(roots[0]);menu=True
raise SystemExit('DOCUMENT_PICKER_TIMEOUT seen='+str(seen))
