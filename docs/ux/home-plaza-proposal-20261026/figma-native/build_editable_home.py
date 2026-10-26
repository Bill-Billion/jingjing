"""Build editable SVG layout sources for normal Figma clipboard import.

This authors vectors/text and references the untouched Imagegen photo atlas.
It does not alter raster image pixels or produce a flattened UI screenshot.
"""
from pathlib import Path
import base64
import html
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ATLAS = HERE.parent / 'figma-assets/editorial-photo-atlas-v1.png'
ICON_SOURCE = ROOT / '晶晶日上工程交接包/01_源码/frontend_ops_workspace/node_modules/@element-plus/icons-vue/dist/index.js'
source = ICON_SOURCE.read_text()
icons = {}
for name in ['User', 'Search', 'Grid', 'OfficeBuilding', 'Histogram', 'VideoPlay', 'Film', 'Document', 'ChatDotRound', 'ArrowDown', 'House']:
    match = re.search(r'name: "' + name + r'"', source)
    block = source[match.start():].split('// src/', 1)[0]
    icons[name] = re.findall(r'\bd: "([^"]+)"', block)

PAPER, INK, RED, MUTED, LINE = '#F3F1E8', '#151515', '#EF4938', '#62625C', '#CFCEC5'
atlas_data = base64.b64encode(ATLAS.read_bytes()).decode()
crops = {
    'sea': (2, 2, 623, 413),
    'actor': (629, 2, 623, 413),
    'actress': (2, 419, 623, 410),
    'rain': (629, 419, 623, 410),
    'summer': (2, 833, 623, 419),
    'studio': (629, 833, 623, 419),
}

def rect(x, y, w, h, fill, name='', **attrs):
    extra = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<rect id="{name}" x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" {extra}/>'

def text(label, x, y, size=14, weight=400, serif=False, color=INK, name='', anchor='start'):
    family = 'Noto Serif SC' if serif else 'Noto Sans SC'
    return f'<text id="{name}" x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{color}">{html.escape(label)}</text>'

def icon(name, x, y, size=24, color=INK, identifier=''):
    paths = ''.join(f'<path fill="{color}" d="{d}"/>' for d in icons[name])
    return f'<g id="{identifier or "Icon-" + name}" transform="translate({x} {y}) scale({size / 1024})">{paths}</g>'

def group(name, nodes):
    return f'<g id="{name}">' + ''.join(nodes) + '</g>'

def image(crop, x, y, w, h, key):
    bx, by, bw, bh = crops[crop]
    scale = max(w / bw, h / bh)
    tx = (w - bw * scale) / 2 - bx * scale
    ty = (h - bh * scale) / 2 - by * scale
    matrix = f'{scale/w:.9f} 0 0 {scale/h:.9f} {tx/w:.9f} {ty/h:.9f}'
    return f'<defs><pattern id="{key}" width="1" height="1" patternContentUnits="objectBoundingBox"><use xlink:href="#PhotoAtlas" transform="matrix({matrix})"/></pattern></defs>' + rect(x, y, w, h, f'url(#{key})', 'Photo-' + crop)

def header():
    status = [text('9:41', 24, 21, 12, 700, name='Status-Time')]
    for n in range(4):
        status.append(rect(312+n*4, 19-(n+1)*3, 2.5, (n+1)*3, INK))
    status += ['<path d="M333 13 Q339 7 345 13 M335 16 Q339 12 343 16 M338 19 L340 19" fill="none" stroke="#151515" stroke-width="1.4" stroke-linecap="round"/>', '<rect x="351" y="9" width="20" height="11" rx="2" fill="none" stroke="#151515" stroke-width="1"/>', rect(353,11,16,7,INK),rect(372,12,2,5,INK)]
    mast = [text('晶晶日上',16,67,29,900,True,name='Title-Brand'),text('上海',222,61,13,name='City-Label'),icon('ArrowDown',252,49,12,identifier='City-Arrow'),icon('Search',297,44,23,identifier='Action-Search'),icon('User',349,44,23,identifier='Action-Identity')]
    tabs = []
    for i,label in enumerate(['精选','艺人','视频','同城']):
        tabs.append(text(label,18+i*94,103,16,700 if i==0 else 400,name='Channel-'+label))
    tabs += [rect(16,115,358,0.6,LINE),rect(16,114,42,2,RED)]
    return [group('StatusBar',status),group('Header',mast),group('Channels',tabs)]

def footer():
    nodes=[rect(0,776,390,68,PAPER),rect(0,776,390,0.6,LINE)]
    for i,(label,ic) in enumerate(zip(['广场','试镜','通告','消息','我的'],['House','Film','Document','ChatDotRound','User'])):
        x=39+i*78
        nodes += [icon(ic,x-11,786,22,identifier='NavIcon-'+label),text(label,x,823,11,700 if i==0 else 400,anchor='middle',name='NavLabel-'+label)]
    nodes += ['<circle cx="54" cy="788" r="2.7" fill="#EF4938"/>','<rect x="151" y="837" width="88" height="3" rx="1.5" fill="#151515"/>']
    return group('BottomNavigation',nodes)

def first():
    nodes=header()
    quick=[]
    for i,(label,ic) in enumerate(zip(['找艺人','看作品','艺人榜','找机构','全部'],['User','VideoPlay','Histogram','OfficeBuilding','Grid'])):
        x=39+i*78
        quick += [icon(ic,x-12,137,24,identifier='QuickIcon-'+label),text(label,x,181,12,anchor='middle',name='QuickLabel-'+label)]
    nodes.append(group('QuickAccess',quick))
    nodes.append(group('FeaturedWork',[
        image('sea',80,204,310,250,'FeaturedPhoto'),
        rect(0,204,80,250,PAPER),rect(0,259,155,130,PAPER),rect(0,397,142,57,PAPER),
        rect(16,219,8,8,RED),text('本期精选',31,227,12,name='Featured-Eyebrow'),
        text('山海',16,316,55,900,True,name='Title-Featured-First'),
        text('之间',16,375,55,900,True,name='Title-Featured-Second'),
        text('剧情 · 生活',16,416,12,name='Featured-Genre'),text('查看作品 ↗',16,443,13,500,name='Featured-Link'),
    ]))
    nodes.append(rect(16,474,358,0.6,INK,'Divider-Artists'))
    nodes.append(group('ArtistsHeading',[text('发现艺人',16,509,26,900,True,name='Title-Artists'),text('更多 ↗',374,506,12,anchor='end',name='Artists-More')]))
    cards=[]
    for name,meta,crop,x in [('林川','上海 · 剧情','actor',16),('苏禾','上海 · 表演','actress',202)]:
        cards.append(group('ArtistCard-'+name,[image(crop,x,525,172,185,'ArtistPhoto-'+crop),text(name,x,741,20,900,True,name='Title-Artist-'+name),text(meta,x,764,12,color=MUTED,name='ArtistMeta-'+name)]))
    nodes.append(group('ArtistsGrid',cards))
    nodes.append(footer())
    return nodes

def second():
    nodes=header()
    nodes.append(group('WorksHeading',[text('现成作品',16,155,26,900,True,name='Title-Works'),text('更多 ↗',374,153,12,anchor='end')]))
    rows=[]
    for title,genre,crop,y in [('雨巷来信','悬疑 · 剧情','rain',173),('夏天的尽头','生活 · 成长','summer',302)]:
        rows.append(group('WorkRow-'+crop,[image(crop,16,y,202,114,'WorkPhoto-'+crop),'<circle cx="36" cy="'+str(y+91)+'" r="14" fill="#151515" opacity="0.85"/>','<path d="M32 '+str(y+84)+' L43 '+str(y+91)+' L32 '+str(y+98)+' Z" fill="white"/>',text(title,234,y+29,19,900,True,name='Title-Work-'+crop),text(genre,234,y+56,12,color=MUTED),text('查看预览 ↗',234,y+94,12,500)]))
    nodes.append(group('WorksList',rows))
    nodes.append(rect(16,434,358,.6,INK))
    nodes.append(group('LocalHeading',[text('同城机会',16,473,27,900,True,name='Title-Local'),text('上海',161,470,13)]))
    notices=[]
    for category,title,meta,y in [('招募','短片演员招募','剧情短片 · 上海',490),('活动','城市影像共创','影像活动 · 上海',560)]:
        notices.append(group('Notice-'+category,[rect(16,y+17,7,7,RED),text(category,30,y+26,12,500),text(title,89,y+25,18,700,True,name='Title-Notice-'+category),text(meta,89,y+49,11,color=MUTED),text('↗',366,y+33,19,anchor='end'),rect(16,y+65,358,.6,LINE)]))
    nodes.append(group('LocalNotices',notices))
    nodes.append(group('RankingBanner',[image('studio',16,637,358,58,'RankingPhoto'),rect(16,637,358,58,INK,opacity='.45'),text('艺人榜单',31,676,23,900,True,color=PAPER,name='Title-Ranking'),text('查看榜单 ↗',359,673,11,color=PAPER,anchor='end')]))
    nodes.append(group('StoryCallout',[text('你的故事，也值得被看见',16,729,18,700,True,name='Title-Story'),text('从一个想法开始',16,751,12,color=MUTED),rect(280,711,94,42,RED),text('写下故事 ↗',327,737,12,500,color='#FFFFFF',anchor='middle'),text('我的故事与草稿 ↗',374,771,11,anchor='end')]))
    nodes.append(footer())
    return nodes

manifest={'type':'editable-svg-layout-source','source_photography':'../figma-assets/editorial-photo-atlas-v1.png','photos_are_concept_only':True,'icon_source':'@element-plus/icons-vue, existing project dependency','screens':[]}
for key,fn in [('featured-top',first),('featured-scroll',second)]:
    body=''.join(fn())
    svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="390" height="844" viewBox="0 0 390 844"><defs><image id="PhotoAtlas" width="1254" height="1254" xlink:href="data:image/png;base64,'+atlas_data+'"/></defs>'+rect(0,0,390,844,PAPER,'Canvas')+body+'</svg>'
    target=HERE/(key+'.svg')
    target.write_text(svg)
    manifest['screens'].append({'file':target.name,'width':390,'height':844,'text_nodes':svg.count('<text '),'native_vector_paths':svg.count('<path '),'photo_slots':body.count('id="Photo-'),'complete_ui_raster':False})
(HERE/'SOURCE.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False))
