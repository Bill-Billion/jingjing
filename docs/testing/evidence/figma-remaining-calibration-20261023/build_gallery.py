#!/usr/bin/env python3
"""Rebuild the local Figma comparison gallery from exported screenshots."""
import html
import json
import re
import shutil
from collections import OrderedDict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ORIGINALS = Path('/Users/yanghaoran/Code/jingjing/output/imagegen/app-experimental-v3')
REFERENCES = [
    ('01-home-and-discovery-v3.png', '首页 / 入戏（剧本目录）'),
    ('02-story-and-my-v3.png', '剧本详情 / 我的'),
    ('03-task-and-feedback-v3.png', '定制任务 / 样片反馈'),
]
FIGMA = 'https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id='
EXCLUDED_HOME_IDS = {'2:69', '2004:5895'}


def read_reviews(path):
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    if isinstance(data, dict) and 'reviews' in data:
        data = data['reviews']
    if isinstance(data, list):
        assert all(isinstance(row, dict) and row.get('id') for row in data), 'Invalid review list'
        assert len({str(row['id']) for row in data}) == len(data), 'Duplicate review IDs'
        return {str(row['id']): row for row in data}
    assert isinstance(data, dict), 'REVIEWS.json must be an object or a list'
    return {str(key): value if isinstance(value, dict) else {'status': value}
            for key, value in data.items()}


def reference_for(screen):
    name = re.sub(r'^(?:\d+|[SC]\d+)\s*/\s*', '', screen['name'])
    if name == '广场':
        return 0, '原稿直接对应', '首页原稿；最新城市、频道及业务内容仍需保留。'
    if name in ('我的', '我的 · 消费者视图'):
        return 1, '原稿直接对应', '“我的”原稿；按最新需求保留目录入口。'
    if name in ('定制任务', '制作任务详情'):
        return 2, '原稿直接对应', '任务页原稿；现有办理事实与状态分别呈现。'
    if name == '样片反馈':
        return 2, '原稿直接对应', '样片反馈原稿；原稿没有最终成片验收专屏。'
    if name in ('入戏', '剧本目录'):
        return 0, '原稿直接对应', '“入戏”剧本目录原稿。'
    if name == '剧本详情':
        return 1, '原稿直接对应', '剧本详情原稿。'
    if any(word in name for word in ('作品', '商品', '试镜', '通告', '艺人', '榜', '发现', '搜索')):
        ref = 0
    elif any(word in name for word in ('任务', '制作', '审片', '交付', '付款', '订单', '合同', '报价', '验收')):
        ref = 2
    else:
        ref = 1
    return ref, '视觉语言适配', '原稿没有该页专屏；参考图文比例、字级、分隔与办理区构图。'


def screenshot(root, phase, screen):
    path = root / phase / (screen['id'].replace(':', '-') + '.png')
    if not path.exists():
        return None
    with Image.open(path) as image:
        image.verify()
    return path


def review_status(review, has_after):
    if not has_after:
        return 'missing', '受额度阻塞 · 尚未校准'
    raw = str(review.get('status', '')).strip()
    if raw.upper() in ('PASS', 'PASSED', 'APPROVED', '通过', '已通过'):
        return 'pass', '验收通过'
    if raw.upper() in ('FAIL', 'FAILED', 'NEEDS_FIX', 'REJECTED', '不通过', '需修正'):
        return 'fail', '需要修正'
    return 'pending', '已更新 · 待验收'


def contact_sheets(root, groups):
    contact = root / 'contact'
    contact.mkdir(exist_ok=True)
    for old in contact.glob('sheet-*.png'):
        old.unlink()
    font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 17)
    small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    sheets = []
    for board_number, (board, screens) in enumerate(groups.items(), 1):
        for phase in ('before', 'after'):
            available = [(screen, screenshot(root, phase, screen)) for screen in screens]
            available = [(screen, path) for screen, path in available if path]
            for offset in range(0, len(available), 4):
                chunk = available[offset:offset + 4]
                images = []
                for screen, path in chunk:
                    with Image.open(path) as source:
                        source.load()
                        images.append(source.convert('RGB'))
                # Keep native pixels: a 390 px export stays 390 px on the sheet.
                widths = [max(390, image.width) for image in images]
                width = sum(widths) + 20 * (len(images) + 1)
                height = max(image.height for image in images) + 114
                canvas = Image.new('RGB', (width, height), '#e9e6df')
                draw = ImageDraw.Draw(canvas)
                draw.text((20, 14), board, font=font, fill='#151515')
                draw.text((20, 39), f'{phase} · native pixels · {len(chunk)} screens', font=small, fill='#515151')
                x = 20
                for (screen, _), image, column_width in zip(chunk, images, widths):
                    label = screen['name']
                    while draw.textlength(label, font=font) > column_width - 4:
                        label = label[:-2] + '…'
                    draw.text((x, 66), label, font=font, fill='#151515')
                    draw.text((x, 88), screen['id'], font=small, fill='#666666')
                    canvas.paste(image, (x, 114))
                    x += column_width + 20
                filename = f'sheet-{board_number:02d}-{phase}-{offset // 4 + 1:02d}.png'
                canvas.save(contact / filename)
                sheets.append({'board': board, 'phase': phase, 'path': 'contact/' + filename,
                               'screenIds': [screen['id'] for screen, _ in chunk],
                               'width': width, 'height': height})
                assert len(chunk) <= 4
    (contact / 'MANIFEST.json').write_text(json.dumps(sheets, ensure_ascii=False, indent=2) + '\n')
    return sheets


def build(root=ROOT):
    inventory = json.loads((root / 'SCREEN_INVENTORY.json').read_text())
    assert isinstance(inventory, list) and inventory, 'SCREEN_INVENTORY.json must be a nonempty list'
    assert all(set(('id', 'name', 'board')).issubset(screen) for screen in inventory), 'Missing inventory fields'
    assert len({screen['id'] for screen in inventory}) == len(inventory), 'Duplicate screen IDs'
    reviews = read_reviews(root / 'REVIEWS.json')
    unknown = set(reviews) - {screen['id'] for screen in inventory}
    assert not unknown, f'Unknown review IDs: {sorted(unknown)}'
    groups = OrderedDict()
    for screen in inventory:
        groups.setdefault(screen['board'], []).append(screen)
    sheets = contact_sheets(root, groups)
    reference_links = []
    for number, (filename, label) in enumerate(REFERENCES, 1):
        target = root / 'contact' / f'reference-{number:02d}.png'
        local_sources = [root / 'assets' / f'{number:02d}-original.png', target]
        if number == 1:
            local_sources.insert(0, root.parent / 'figma-home-calibration-20261023/assets/earliest-reference.png')
        source = next((path for path in local_sources if path.exists()), ORIGINALS / filename)
        if source.exists() and source != target:
            shutil.copy2(source, target)
        assert target.exists(), f'Missing original reference: {filename}'
        reference_links.append((f'contact/{target.name}', label))
    esc = lambda value: html.escape(str(value), quote=True)
    cards = []
    counts = {'excluded': 0, 'pass': 0, 'fail': 0, 'pending': 0, 'missing': 0}
    before_count = after_count = 0
    for screen in inventory:
        before = screenshot(root, 'before', screen)
        after = screenshot(root, 'after', screen)
        before_count += bool(before)
        after_count += bool(after)
        review = reviews.get(screen['id'], {})
        status, label = review_status(review, bool(after))
        if screen['id'] in EXCLUDED_HOME_IDS:
            status, label = 'excluded', '上一轮已完成 · 本轮排除'
        counts[status] += 1
        ref_index, reference_mode, reference_note = reference_for(screen)
        reference_mode = review.get('referenceMode', reference_mode)
        reference_note = review.get('reference', reference_note)
        reference_image = review.get('referenceImage', reference_links[ref_index][0])
        assert reference_image in {path for path, _ in reference_links}, f'Unknown reference image: {reference_image}'
        reference_caption = dict(reference_links)[reference_image]
        notes = review.get('notes', review.get('findings', ''))
        if isinstance(notes, (list, dict)):
            notes = json.dumps(notes, ensure_ascii=False)
        note_label = '验收记录' if status in ('pass', 'fail') else '待核对'
        business_checks = review.get('businessChecks', [])
        if isinstance(business_checks, dict):
            business_checks = [f'{key}：{value}' for key, value in business_checks.items()]
        elif isinstance(business_checks, str):
            business_checks = [business_checks]
        business_html = ''
        if business_checks:
            check_items = ''.join(f'<li>{esc(json.dumps(item, ensure_ascii=False) if isinstance(item, (dict, list)) else item)}</li>'
                                  for item in business_checks)
            business_html = f'<details class="business-checks"><summary>待核对业务项（未验证）</summary><ul>{check_items}</ul></details>'
        pictures = []
        for phase, path in [('before', before), ('after', after)]:
            title = '原状证据 · Figma真实截图（本轮只读）' if phase == 'before' else '修改后 · Figma真实截图'
            if path:
                relative = path.relative_to(root).as_posix()
                with Image.open(path) as im:
                    size = f'{im.width} × {im.height}'
                picture = (f'<a class="shot" href="{esc(relative)}" data-image="{esc(relative)}" '
                           f'data-title="{esc(screen["name"] + " · " + title)}"><img loading="lazy" '
                           f'src="{esc(relative)}" alt="{esc(screen["name"] + " · " + title)}"></a>'
                           f'<small>{size} · 点击查看完整截图</small>')
            else:
                continue
            pictures.append(f'<figure><figcaption>{title}</figcaption>{picture}</figure>')
        cards.append((screen['board'], f'''<article class="screen{' compact' if not pictures else ''}" data-board="{esc(screen['board'])}"
          data-status="{status}" data-search="{esc(screen['id'] + ' ' + screen['name'] + ' ' + str(notes))}">
          <div class="screen-head"><h3>{esc(screen['name'])}</h3><span class="badge {status}">{label}</span></div>
          <p class="meta">{esc(screen['id'])} · <a href="{FIGMA + esc(screen['id'].replace(':', '-'))}">原Figma节点</a>
          · <a href="{esc(reference_image)}" data-image="{esc(reference_image)}"
          data-title="{esc(reference_caption)}">{esc(reference_mode)} · 参考原稿</a></p>
          <p class="reference-note">{esc(reference_note)}</p>
          {f'<p class="review-note">{note_label}：{esc(notes)}</p>' if notes else ''}
          {business_html}
          {f'<div class="comparison{" single" if len(pictures) == 1 else ""}">{"".join(pictures)}</div>' if pictures else ''}</article>'''))
    sections = []
    for board, screens in groups.items():
        board_sheets = [sheet for sheet in sheets if sheet['board'] == board]
        links = ' '.join(f'<a href="{sheet["path"]}">{"修改前" if sheet["phase"] == "before" else "修改后"}'
                         f'联系表 {sum(1 for earlier in board_sheets[:i + 1] if earlier["phase"] == sheet["phase"])}</a>'
                         for i, sheet in enumerate(board_sheets))
        sections.append(f'<section class="board"><h2>{esc(board)} <small>{len(screens)} 页</small></h2>'
                        f'<p class="contacts">{links or "联系表待截图后生成"}</p>'
                        + ''.join(card for group, card in cards if group == board) + '</section>')
    ref_html = ''.join(f'<a href="{path}" data-image="{path}" data-title="{esc(label)}">'
                       f'<img src="{path}" alt="{esc(label)}"><b>{esc(label)}</b></a>'
                       for path, label in reference_links)
    options = ''.join(f'<option value="{esc(board)}">{esc(board)}</option>' for board in groups)
    output = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>先锋电影刊物 · Figma校准准备包</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#151515;background:#f3f1e8}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:3px}header,main{max-width:1100px;margin:auto;padding:26px 24px}header{padding-bottom:8px}h1,h2,h3{font-family:"Songti SC","STSong",serif}h1{font-size:38px;margin:6px 0 16px}h2{font-size:27px;border-top:3px solid #151515;padding-top:20px;margin-top:38px}h2 small{font:13px sans-serif;color:#666}h3{font-size:24px;margin:0}p{line-height:1.7}.summary{background:#151515;color:#f3f1e8;padding:18px 22px;font-weight:600}.warning{font-size:14px;color:#57544f}.references{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.references a{display:block;font-size:14px;text-decoration:none}.references img{width:100%;border:1px solid #bbb}.references b{display:block;margin-top:6px}.filters{position:sticky;top:0;background:#f3f1e8f5;backdrop-filter:blur(8px);padding:15px 24px;z-index:2;border-bottom:1px solid #bbb;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.filters input,.filters select{font:14px inherit;padding:10px;border:1px solid #aaa;background:#fffdf6;min-width:180px}.filters input{flex:1;max-width:330px}.screen{margin:24px 0 32px;border-top:1px solid #aaa;padding-top:20px}.screen-head{display:flex;gap:12px;justify-content:space-between;align-items:center}.meta{font-size:12px;color:#666;margin:8px 0}.reference-note{font-size:13px;color:#666;margin:0 0 10px}.review-note{font-size:14px;padding:12px 15px;border-left:3px solid #ef4938;background:#eae6dc;white-space:pre-wrap}.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,390px));gap:24px;justify-content:center}.comparison figure{margin:0;min-width:0}.comparison figcaption{padding:12px 0;font-size:14px;font-weight:600}.shot{display:block;height:560px;overflow:hidden;background:#ddd;border:1px solid #aaa}.shot img{display:block;width:100%;height:auto}.comparison small{display:block;color:#666;font-size:12px;margin-top:8px}.empty{height:560px;display:grid;place-items:center;background:#e8e4da;color:#777;border:1px dashed #aaa}.badge{font-size:12px;padding:6px 10px;white-space:nowrap;border:1px solid #aaa}.badge.pass{background:#1f4c36;color:#fff}.badge.fail{background:#9c2920;color:#fff}.badge.pending{background:#151515;color:#fff}.contacts{font-size:13px;display:flex;gap:14px;flex-wrap:wrap}.contacts a{background:#e7e3d9;padding:7px 10px}.hidden{display:none!important}#results{align-self:center;font-size:13px}dialog{padding:0;max-width:98vw;max-height:96vh;border:1px solid #777;background:#e7e4dc}dialog::backdrop{background:#000b}.dialog-head{position:sticky;top:0;background:#151515;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;gap:22px;z-index:1}.dialog-head button{background:#f3f1e8;padding:8px 14px;border:0;font:14px inherit;cursor:pointer}.dialog-content{padding:18px;overflow:auto}.dialog-content img{display:block;max-width:none;height:auto;margin:auto}footer{max-width:1100px;margin:auto;padding:20px 24px 50px;color:#777;font-size:13px}@media(max-width:650px){header,main{padding:20px 14px}h1{font-size:30px}.references{grid-template-columns:1fr}.references img{max-width:390px}.comparison{gap:10px}.shot,.empty{height:380px}h3{font-size:21px}.screen-head{align-items:start}.filters{position:static;padding:14px}.filters input,.filters select{min-width:100%;max-width:none}.dialog-content{padding:8px}}
</style>
<header><p>晶晶日上 · 2026-10-23</p><h1>先锋电影刊物<br>其余页面校准准备包</h1>
<p class="blocked"><b>BLOCKED · 外部调用额度</b><br>Figma Starter 套餐的 MCP 调用额度已用尽。本轮只完成只读盘点，尚未修改其余100页。本包是原稿参考、完整页面清单和已取得的修改前截图，不是校准或验收结果。</p>
<p class="summary">SUMMARY</p>
<p class="warning">清单共102页，其中主页、视频频道两个节点上一轮已完成，本轮排除。其余100页受额度阻塞，尚未校准；三张原状截图仅是准备证据。视觉基准只有六屏，其他页面按视觉语言适配。后续有修改后截图也不自动代表验收通过。本包不代表 App、接口或生产交易已验证。</p>
<details open><summary>三张最早原稿 · 六个实际画面</summary><div class="references">REFERENCES</div></details>
<details><summary>按页类型使用原稿的规则</summary><ul class="rules"><li><b>发现与内容目录：</b>参考“入戏”的黑底、超大宋体、交错图文；不是统一铺满圆角卡片。</li><li><b>详情与资料：</b>参考剧本详情的窄叙事列、右侧贯穿图、跨列大题及黑色底部动作；用途与授权正文独立保留。</li><li><b>我的与功能目录：</b>参考上黑下纸、巨大“我”、短横线、大宋体目录与右箭头；按最新需求保留各入口。</li><li><b>制作与样片反馈：</b>参考任务页的左纸右图、当前待办黑条、细线进度与事实表；反馈页为黑色播放器加纸色意见区，样片确认与最终验收分开。</li><li><b>表单、消息、付款与交付：</b>原稿没有独立专屏。采用纸面字段、清晰字级、细线与独立状态，不添加无依据的付款、签约、验收事实。</li></ul></details></header>
<div class="filters"><input id="search" type="search" placeholder="搜索页面名称、节点或验收记录" aria-label="搜索页面"><select id="board" aria-label="筛选板块"><option value="">全部板块</option>OPTIONS</select><select id="status" aria-label="筛选状态"><option value="">全部状态</option><option value="excluded">上一轮已完成 · 本轮排除</option><option value="pass">验收通过</option><option value="fail">需要修正</option><option value="pending">已更新 · 待验收</option><option value="missing">受额度阻塞 · 尚未校准</option></select><span id="results"></span></div>
<main>SECTIONS</main><footer>截图预览可能只显示上半部分，点击可查看完整原尺寸长图。联系表每张最多四页，保留截图原像素，不缩小文字。所有截图和原稿均为本地文件；“原Figma节点”链接需联网打开。</footer>
<dialog id="viewer"><div class="dialog-head"><span id="image-title"></span><button id="close" aria-label="关闭大图">关闭</button></div><div class="dialog-content"><img id="full-image" alt=""></div></dialog>
<script>
const cards=[...document.querySelectorAll('.screen')],boards=[...document.querySelectorAll('.board')];
function filter(){const q=document.querySelector('#search').value.trim().toLowerCase(),b=document.querySelector('#board').value,s=document.querySelector('#status').value;let visible=0;for(const c of cards){const show=(!q||c.dataset.search.toLowerCase().includes(q))&&(!b||c.dataset.board===b)&&(!s||c.dataset.status===s);c.classList.toggle('hidden',!show);visible+=show}for(const section of boards)section.classList.toggle('hidden',![...section.querySelectorAll('.screen')].some(c=>!c.classList.contains('hidden')));document.querySelector('#results').textContent=visible+' / '+cards.length+' 页'}
document.querySelectorAll('.filters input,.filters select').forEach(e=>e.addEventListener('input',filter));filter();
const viewer=document.querySelector('#viewer');document.addEventListener('click',e=>{const link=e.target.closest('[data-image]');if(!link)return;e.preventDefault();const img=document.querySelector('#full-image');img.src=link.dataset.image;img.alt=link.dataset.title;document.querySelector('#image-title').textContent=link.dataset.title;viewer.showModal()});document.querySelector('#close').addEventListener('click',()=>viewer.close());viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close()});
</script></html>'''
    summary = (f'{len(inventory)} 页 · 修改前截图 {before_count} · 修改后截图 {after_count} · '
               f'上一轮完成并排除 {counts["excluded"]} · '
               f'验收通过 {counts["pass"]} · 待验收 {counts["pending"]} · '
               f'需修正 {counts["fail"]} · 受阻未校准 {counts["missing"]}')
    output = output.replace('SUMMARY', esc(summary)).replace('REFERENCES', ref_html)
    output = output.replace('OPTIONS', options).replace('SECTIONS', ''.join(sections))
    output = output.replace('</style>', '.blocked{border:2px solid #a43b2e;padding:16px 20px;color:#762b23;background:#f6e7dc}.badge.excluded{background:#e0dfda;color:#42423f}.comparison.single{grid-template-columns:minmax(0,390px)}.compact{margin:0;padding:12px 0}.compact h3{font:600 16px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.compact .meta{margin:6px 0 0}.compact .reference-note{margin:3px 0;font-size:12px}.rules{padding-left:22px;line-height:1.8;font-size:14px}.rules li{margin:8px 0}</style>')
    assert output.count('<article class="screen') == len(inventory)
    assert sum(counts.values()) == len(inventory)
    (root / 'index.html').write_text(output)
    result = {'screens': len(inventory), 'before': before_count, 'after': after_count,
              'statuses': counts, 'contactSheets': len(sheets), 'gallery': str(root / 'index.html')}
    print(json.dumps(result, ensure_ascii=False))
    return result


if __name__ == '__main__':
    build()
