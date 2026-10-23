#!/usr/bin/env python3
"""Generate local Noto faces; requires the optional fonttools[woff] 4.61.1 tool."""
import hashlib
import json
from pathlib import Path
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / '晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/assets/fonts'
SOURCE_SHA = '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9'
SOURCE_REVISION = '8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generate(source):
    assert digest(source) == SOURCE_SHA, 'Use the pinned official Noto Serif SC source'
    original = TTFont(source)
    coverage = set(original.getBestCmap())
    results = []
    for weight, style in [(700, 'Bold'), (900, 'Black')]:
        face = instantiateVariableFont(TTFont(source), {'wght': weight},
                                       inplace=True, updateFontNames=True)
        assert 'fvar' not in face and face['OS/2'].usWeightClass == weight
        assert set(face.getBestCmap()) == coverage, 'Do not trim name or input characters'
        ttf = FONTS / f'NotoSerifSC-{style}.ttf'
        face.save(ttf)
        face.flavor = 'woff2'
        woff = ttf.with_suffix('.woff2')
        face.save(woff)
        assert TTFont(woff).getBestCmap() == TTFont(ttf).getBestCmap()
        results.append({'weight': weight, 'style': style, 'unicodeCount': len(coverage),
                        'files': [{'file': p.name, 'bytes': p.stat().st_size,
                                   'sha256': digest(p)} for p in [ttf, woff]]})
        print(f'{style}: {len(coverage)} code points retained', flush=True)
    sans = FONTS / 'NotoSansSC.ttf'
    face = TTFont(sans)
    face.flavor = 'woff2'
    woff = sans.with_suffix('.woff2')
    face.save(woff)
    assert TTFont(woff).getBestCmap() == TTFont(sans).getBestCmap()
    results.append({'style': 'Sans variable 100–900',
                    'unicodeCount': len(face.getBestCmap()),
                    'files': [{'file': p.name, 'bytes': p.stat().st_size,
                               'sha256': digest(p)} for p in [sans, woff]]})
    (FONTS / 'FONT_MANIFEST.json').write_text(json.dumps({
        'sourceRevision': SOURCE_REVISION, 'sourceSha256': SOURCE_SHA,
        'scope': 'Full upstream Unicode coverage retained; WOFF2 serves Vue, TTF serves Flutter.',
        'fonts': results,
    }, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: build-editorial-fonts.py <pinned NotoSerifSC variable TTF>')
    generate(Path(sys.argv[1]))
