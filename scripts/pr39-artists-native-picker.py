import subprocess,time,xml.etree.ElementTree as ET,re,sys,json,os
adb=os.environ.get('ADB_PATH','adb');out,name=sys.argv[1:]
def call(*args):return subprocess.check_output([adb,'-s',os.environ.get('NATIVE_DEVICE_ID','emulator-5554'),*args],stderr=subprocess.DEVNULL,text=True)
def tap(node):
 nums=list(map(int,re.findall(r'\d+',node.attrib['bounds'])));call('shell','input','tap',str((nums[0]+nums[2])//2),str((nums[1]+nums[3])//2))
menu=False
for i in range(75):
 time.sleep(.5)
 try:
  call('shell','uiautomator','dump','/sdcard/pr39-picker.xml');xml=call('shell','cat','/sdcard/pr39-picker.xml');root=ET.fromstring(xml);nodes=list(root.iter('node'))
 except Exception:continue
 if not any('documentsui' in n.attrib.get('package','') for n in nodes):continue
 files=[n for n in nodes if n.attrib.get('text')=='pr39-synthetic.png']
 if files:
  tap(files[0]);open(os.path.join(out,'picker-'+name+'.xml'),'w').write(xml);print('PICKER_SELECTED '+name,flush=True);sys.exit(0)
 downloads=[n for n in nodes if n.attrib.get('text')=='Downloads' and n.attrib.get('clickable')=='true']
 if not downloads:downloads=[n for n in nodes if n.attrib.get('text')=='Downloads']
 if downloads:tap(downloads[0]);continue
 roots=[n for n in nodes if n.attrib.get('content-desc') in ['Show roots','显示根目录','打开抽屉式导航栏']]
 if roots and not menu:tap(roots[0]);menu=True
print('PICKER_FAILED '+name,flush=True);sys.exit(1)
