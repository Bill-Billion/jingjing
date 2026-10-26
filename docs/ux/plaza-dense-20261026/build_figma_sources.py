"""Create semantic editable screens for normal webpage import, and XML-check them."""
from svg_common import *
from figma_main import build_main
from figma_subpages import build_subpages
import xml.etree.ElementTree as ET

screens=build_main()+build_subpages();out=HERE/'generated';out.mkdir(exist_ok=True)
manifest=[]
for s in screens:
    source=s.finish();ET.fromstring(source);(out/(s.key+'.svg')).write_text(source)
    manifest.append({'key':s.key,'title':s.title,'file':s.key+'.svg','width':390,'height':s.height,'editable_text_nodes':source.count('<text '),'image_slots':source.count('id="Photo-'),'complete_ui_raster':False})
# Original five-tab overview keeps its 390x844 viewport and pinned bottom bar.
home=screens[0];viewport=Screen('P01-top','精选·首屏',844,bottom=True)
content=''.join(n for n in home.nodes if 'id="Bottom-Navigation"' not in n)
viewport.nodes.insert(0,'<defs><clipPath id="ViewportContent"><rect width="390" height="760"/></clipPath></defs><g clip-path="url(#ViewportContent)">'+content+'</g>')
viewport.nodes=[viewport.nodes[0]]+[n for n in viewport.nodes[1:] if 'id="Bottom-Navigation"' in n]
(out/'P01-top.svg').write_text(viewport.finish());ET.fromstring(viewport.finish())
blocks=[]
for i,s in enumerate(screens):
    x=32+(i%4)*430;y=120+(i//4)*1780
    blocks += [text(s.key+' / '+s.title,x,y-24,17,700),group(s.key+'-'+s.title,[s.body()],f'translate({x} {y})')]
body=''.join(blocks);height=120+((len(screens)+3)//4)*1780
board=f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1750" height="{height}" viewBox="0 0 1750 {height}">'+defs(body)+rect(0,0,1750,height,'#E5E5E5')+text('晶晶日上 / 紧凑广场与相关子页面',32,42,27,900,True)+text('可编辑讨论稿 · 人物与内容均为示意 · 已有接口与缺口状态分别表达',32,72,13,color=MUTED)+body+'</svg>'
ET.fromstring(board);(out/'all-screens.svg').write_text(board)
(HERE/'SOURCE.json').write_text(json.dumps({'source':'native-editable-svg','fallback':'Figma Starter MCP limit; normal signed-in web import','date':'2026-10-27','screens':manifest,'complete_ui_raster':False},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'screens':len(screens),'editable_text_nodes':sum(x['editable_text_nodes'] for x in manifest),'largest_asset_bytes':max(p.stat().st_size for p in out.glob('*.svg')),'board_height':height},ensure_ascii=False))
