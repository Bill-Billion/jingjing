"""Editable SVG source for normal Figma webpage import; no UI rasterization."""
from pathlib import Path
import base64, html, json, re

HERE=Path(__file__).resolve().parent
ICONS=json.loads((HERE/'icons.json').read_text())
PAPER,INK,RED,MUTED,LINE,WASH='#F3F1E8','#151515','#EF4938','#66645F','#CECBC2','#E5E1D7'
ACTION='#A73124'  # Existing product red; small white labels remain readable.
def esc(v):return html.escape(str(v),quote=True)
def rect(x,y,w,h,fill=PAPER,name='',**attrs):
    extra=' '.join(f'{k.replace("_","-")}="{esc(v)}"' for k,v in attrs.items())
    return f'<rect id="{esc(name)}" x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" {extra}/>'
def text(v,x,y,size=14,weight=400,serif=False,color=INK,name='',anchor='start'):
    family='Noto Serif SC' if serif else 'Noto Sans SC'
    return f'<text id="{esc(name or v)}" x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{esc(v)}</text>'
def group(name,items,transform=''):
    return f'<g id="{esc(name)}"'+(f' transform="{transform}"' if transform else '')+'>'+''.join(items)+'</g>'
def icon(name,x,y,size=24,color=INK):
    return group('Icon-'+name,[f'<path d="{d}" fill="{color}"/>' for d in ICONS[name]],f'translate({x} {y}) scale({size/1024})')
def photo(slot,x,y,w,h,name='',portrait=False,circle=False):
    if portrait:
        atlas='PortraitAtlas';bx=(slot%4)*313.5;by=(slot//4)*313.5;bw=bh=313.5
    else:
        atlas='FilmAtlas';bx,by,bw,bh=[(2,2,623,413),(629,419,623,410),(2,833,623,419),(629,833,623,419),(629,2,623,413),(2,419,623,410)][slot%6]
    scale=max(w/bw,h/bh);tx=(w-bw*scale)/2-bx*scale;ty=(h-bh*scale)/2-by*scale
    key='photo-'+re.sub(r'[^a-zA-Z0-9]','',f'{atlas}{slot}{x}{y}{w}{h}{name}')
    matrix=f'{scale/w:.9f} 0 0 {scale/h:.9f} {tx/w:.9f} {ty/h:.9f}'
    pattern=f'<defs><pattern id="{key}" width="1" height="1" patternContentUnits="objectBoundingBox"><use xlink:href="#{atlas}" transform="matrix({matrix})"/></pattern></defs>'
    return pattern+rect(x,y,w,h,f'url(#{key})','Photo-'+name,rx=w/2 if circle else 0)
def defs(body):
    parts=[]
    for name,path in [('PortraitAtlas',HERE/'assets/portraits-atlas.png'),('FilmAtlas',HERE.parent/'home-plaza-proposal-20261026/figma-assets/editorial-photo-atlas-v1.png')]:
        if '#'+name in body:
            encoded=base64.b64encode(path.read_bytes()).decode();parts.append(f'<image id="{name}" width="1254" height="1254" xlink:href="data:image/png;base64,{encoded}"/>')
    return '<defs>'+''.join(parts)+'</defs>'
class Screen:
    def __init__(self,key,title,height=844,channel=None,city='上海',bottom=False):
        self.key,self.title,self.height,self.nodes=key,title,height,[]
        self.nodes.append(rect(0,0,390,height,PAPER,'Canvas'))
        self.nodes.append(text('9:41',24,27,12,700,name='Status-Time'))
        status=[rect(310+i*4,25-(i+1)*3,2.5,(i+1)*3,INK) for i in range(4)]
        status += ['<path d="M333 17 Q339 11 345 17 M335 20 Q339 16 343 20 M338 23 L340 23" fill="none" stroke="#151515" stroke-width="1.4" stroke-linecap="round"/>',rect(351,12,20,11,'none',stroke=INK,stroke_width=1,rx=2),rect(353,14,16,7,INK),rect(372,15,2,5,INK)]
        self.nodes.append(group('Status-Indicators',status))
        if channel is not None:
            self.nodes += [text('晶晶日上',16,76,28,900,True,name='Title-Brand'),text(city,204,70,13,name='City-Label'),icon('ArrowDown',240,59,12),icon('Search',292,52,23),icon('User',348,52,23)]
            for i,label in enumerate(['精选','艺人','视频','同城']):self.nodes.append(text(label,36+i*94,119,16,700 if i==channel else 400,serif=i==channel,name='Channel-'+label))
            self.nodes += [rect(16,132,358,1,LINE),rect(16+channel*94,131,78,2,RED)]
        else:
            self.nodes += [icon('ArrowLeft',16,55,22),text(title,52,74,24,900,True,name='Title-Page'),rect(18,94,354,1,LINE)]
        if bottom:self.footer()
    def add(self,*parts):self.nodes.extend(parts);return self
    def title_at(self,v,y,more='',x=18,width=354):
        self.add(text(v,x,y,24,900,True,name='Title-'+v))
        if more:self.add(text(more,x+width,y-2,12,500,name='More-'+v,anchor='end'))
        return self
    def note(self,v,y,x=18,size=12,width=354):
        # Explicit lines preserve editable body text and avoid unreadable shrink.
        limit=max(1,int(width/(size*1.04)))
        lines=[]
        for line in str(v).split('\n'):
            lines.extend([line[i:i+limit] for i in range(0,len(line),limit)] or [''])
        self.add(group('Body-'+v[:16],[text(line,x,y+i*(size+7),size,color=MUTED,name='BodyText') for i,line in enumerate(lines)]));return y+len(lines)*(size+7)
    def button(self,v,y,x=18,w=354,primary=True,name=''):
        return self.add(group(name or 'Button-'+v,[rect(x,y,w,44,ACTION if primary else PAPER,stroke=ACTION if primary else LINE,stroke_width=1),text(v,x+w/2,y+28,14,500,color='#FFFFFF' if primary else INK,anchor='middle',name='Button-Label')]))
    def field(self,label,value,y,multiline=False):
        h=108 if multiline else 48
        self.add(group('Field-'+label,[text(label,18,y,13,500),rect(18,y+12,354,h,PAPER,stroke=LINE,stroke_width=1),text(value,30,y+42,14,color=MUTED)]));return y+h+40
    def entry(self,title,meta,y,category=''):
        self.add(group('Entry-'+title,[rect(18,y+4,7,7,RED),text(category or '入口',32,y+14,11,500),text(title,82,y+15,17,700,True,name='Title-Entry'),text(meta,82,y+38,12,color=MUTED),icon('ArrowRight',348,y+12,20),rect(18,y+56,354,.6,LINE)]));return y+68
    def footer(self):
        y=self.height-84;parts=[rect(0,y,390,84,PAPER),rect(0,y,390,.6,LINE)]
        for i,(label,ic) in enumerate(zip(['广场','试镜','通告','消息','我的'],['House','Film','Document','ChatDotRound','User'])):
            x=39+i*78;parts += [icon(ic,x-11,y+12,22),text(label,x,y+53,11,500,color=RED if i==0 else INK,anchor='middle')]
        parts += [f'<circle cx="54" cy="{y+12}" r="2.5" fill="{RED}"/>',rect(151,self.height-10,88,3,INK,rx=1.5)]
        self.nodes.append(group('Bottom-Navigation',parts))
    def body(self):return ''.join(self.nodes)
    def finish(self):
        body=self.body();return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="390" height="{self.height}" viewBox="0 0 390 {self.height}">'+defs(body)+group(self.key+'-'+self.title,[body])+'</svg>'
