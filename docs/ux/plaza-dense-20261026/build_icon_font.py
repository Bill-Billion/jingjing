"""Convert the exact existing Element Plus SVG paths into a tiny Flutter icon font.

Development tool only (fontTools); the app needs no SVG parser or new dependency.
Coordinates preserve the same 1024-unit viewBox used by the Figma source.
"""
from pathlib import Path
import json, shutil
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
APP=ROOT/'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app'
icons=json.loads((HERE/'icons.json').read_text())
license_source=ROOT/'晶晶日上工程交接包/01_源码/frontend_ops_workspace/node_modules/@element-plus/icons-vue/LICENSE'
order=['.notdef']+list(icons)
glyphs={'.notdef':TTGlyphPen(None).glyph()}
for name,paths in icons.items():
    pen=TTGlyphPen(None)
    svg_pen=TransformPen(Cu2QuPen(pen,max_err=1),(1,0,0,-1,0,1024))
    for path in paths:parse_path(path,svg_pen)
    glyphs[name]=pen.glyph()
cmap={0xE900+i:name for i,name in enumerate(icons)}
font=FontBuilder(1024,isTTF=True)
font.setupGlyphOrder(order);font.setupCharacterMap(cmap);font.setupGlyf(glyphs)
font.setupHorizontalMetrics({name:(1024,0) for name in order})
font.setupHorizontalHeader(ascent=1024,descent=0)
font.setupNameTable({'familyName':'EditorialIcons','styleName':'Regular','uniqueFontIdentifier':'EditorialIcons ElementPlus 20261027','fullName':'EditorialIcons Regular','psName':'EditorialIcons-Regular','version':'Version 1.0','licenseDescription':license_source.read_text()})
font.setupOS2(sTypoAscender=1024,sTypoDescender=0,usWinAscent=1024,usWinDescent=0)
font.setupPost();font.setupMaxp()
target=APP/'assets/fonts/EditorialIcons.ttf';font.save(target)
check=TTFont(target);assert check.getBestCmap()==cmap
shutil.copyfile(license_source,APP/'assets/fonts/EditorialIcons-LICENSE.txt')
constants=["import 'package:flutter/widgets.dart';",'', '/// Exact Element Plus glyphs used by the approved Figma screens.', 'abstract final class EditorialIcons {']
for i,name in enumerate(icons):
    field=name[0].lower()+name[1:]
    constants.append(f"  static const {field} = IconData(0x{0xE900+i:x}, fontFamily: 'EditorialIcons');")
constants.append('}')
(APP/'lib/widgets/editorial_icons.dart').write_text('\n'.join(constants)+'\n')
print(json.dumps({'glyphs':len(cmap),'bytes':target.stat().st_size,'source':'existing @element-plus/icons-vue','new_runtime_dependencies':0}))
