#!/usr/bin/env python3
"""UI-only native smoke checks for the separately installed offline demo APK.

Uses adb/UIAutomator, records screenshots and reads the demo SQLite snapshot
after UI operations. Never injects business rows or touches the online package.
The caller must explicitly supply a disposable emulator serial.
"""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--adb', required=True)
parser.add_argument('--serial', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--scenario', choices=['inspect', 'blessing', 'finish', 'restart'], default='inspect')
args = parser.parse_args()
if not args.serial.startswith('emulator-'):
    raise SystemExit('Only an explicitly selected disposable emulator is supported.')
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
package = 'com.jingjingshangri.jingjingshangri_app.offline'
prefix = [args.adb, '-s', args.serial]
events = []


def adb(*command, binary=False):
    result = subprocess.run(prefix + list(command), check=True, capture_output=True, timeout=90)
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace')


def screen():
    for attempt in range(4):
        raw = adb('exec-out', 'uiautomator', 'dump', '/dev/tty')
        match = re.search(r'(<hierarchy.*?</hierarchy>)', raw, re.S)
        if match:
            (out / 'latest.xml').write_text(match.group(1))
            return ET.fromstring(match.group(1))
        time.sleep(0.5)
    raise RuntimeError('UIAutomator did not return a hierarchy: ' + raw[-300:])


def label(node):
    return node.get('text') or node.get('content-desc') or ''


def bounds(node):
    return list(map(int, re.findall(r'\d+', node.get('bounds', ''))))


def match_node(tree, text, field=False):
    found = [n for n in tree.iter('node') if text in label(n)]
    if field:
        found = [n for n in found if n.get('class') == 'android.widget.EditText']
        # Android's Flutter accessibility bridge omits empty TextField hints
        # from UIAutomator XML. The inspected form has recipient, prefilled
        # occasion, then brief; after recipient entry only brief remains empty.
        if not found and text in ['祝福对象', '祝福内容与制作要求']:
            found = [n for n in tree.iter('node') if n.get('class') == 'android.widget.EditText' and not label(n)]
    else:
        found = [n for n in found if n.get('clickable') == 'true']
        if text == '确认':
            found = [n for n in found if label(n) == text]
    exact = [n for n in found if label(n) == text]
    return (exact or found or [None])[0]


def swipe(direction):
    # The test AVD uses the documented 390 x 844 logical test display.
    y1, y2 = (690, 250) if direction == 'down' else (250, 690)
    adb('shell', 'input', 'swipe', '195', str(y1), '195', str(y2), '180')


def click(text, field=False):
    tree = screen()
    node = match_node(tree, text, field)
    if node is None:
        for direction in ['down'] * 8 + ['up'] * 14:
            swipe(direction)
            tree = screen()
            node = match_node(tree, text, field)
            if node is not None:
                break
    if node is None:
        raise RuntimeError('Missing control: ' + text + '\n' + '\n'.join(label(n) for n in tree.iter('node') if label(n)))
    x1, y1, x2, y2 = bounds(node)
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    events.append(text)
    print('UI:', text, flush=True)


def type_text(text):
    if not re.fullmatch(r'[A-Za-z0-9 ._-]+', text):
        raise ValueError('Smoke input must be simple fictional ASCII text.')
    # Slow virtual devices can drop a burst of input events. Send individual
    # characters so the native text input connection commits each one.
    for character in text:
        adb('shell', 'input', 'text', '%s' if character == ' ' else character)
        time.sleep(0.03)


def capture(name):
    tree = screen()
    (out / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    (out / (name + '.xml')).write_text(ET.tostring(tree, encoding='unicode'))


def wait_for_home():
    # Activity launch can finish before Flutter publishes its accessibility
    # tree on a slow AVD. Require the actual demo home, not a fixed delay.
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            tree = screen()
            if match_node(tree, '定制祝福视频') is not None:
                return
        except RuntimeError:
            pass
        time.sleep(0.5)
    raise RuntimeError('The offline demo home did not become ready after restart.')


def database(name):
    # Read-only evidence from this debug demo application's private database.
    raw = adb('exec-out', 'run-as', package, 'cat', 'files/jingjing_offline_v1.sqlite', binary=True)
    target = out / (name + '.sqlite')
    target.write_bytes(raw)
    import sqlite3
    conn = sqlite3.connect('file:' + str(target) + '?mode=ro', uri=True)
    value = json.loads(conn.execute('SELECT payload FROM demo_state WHERE id=1').fetchone()[0])
    conn.close()
    (out / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2))
    return value


if adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').strip() != '1':
    raise SystemExit('Enable airplane mode on the disposable test emulator first.')
try:
    if args.scenario == 'inspect':
        tree = screen()
        for node in tree.iter('node'):
            if label(node):
                print(label(node), node.get('bounds'), node.get('class'), flush=True)
        capture('inspect')
    elif args.scenario == 'blessing':
        # Starts at home or on a fresh form reached through the normal tile.
        if match_node(screen(), '定制祝福视频') is not None:
            click('定制祝福视频')
        click('祝福对象', field=True)
        type_text('Mom')
        click('祝福内容与制作要求', field=True)
        type_text('Happy birthday. Wishing you joy and good health.')
        adb('shell', 'input', 'keyevent', '4')
        click('我确认有权使用所选素材')
        click('提交祝福需求')
        capture('order-created')
        for step in ['模拟平台报价', '确认报价与演示约定', '确认',
                     '模拟付款 ¥300.00', '确认', '模拟平台提交剧本', '确认剧本',
                     '模拟平台提交样片', '播放本地视频']:
            click(step)
        capture('sample-playing')
        for step in ['确认样片', '模拟付款 ¥400.00', '确认',
                     '模拟平台提交粗剪', '确认粗剪', '模拟付款 ¥300.00', '确认',
                     '模拟平台提交成片', '播放本地视频']:
            click(step)
        capture('final-playing')
        click('确认成片收讫')
        click('确认')
        capture('order-received')
        state = database('after-order')
        assert state['orders'][0]['status'] == 'received'
        assert [p['cents'] for p in state['payments'] if p['record'] == state['orders'][0]['id']] == [30000,40000,30000]
    elif args.scenario == 'finish':
        for step in ['模拟付款 ¥300.00', '确认', '模拟平台提交成片', '播放本地视频']:
            click(step)
        capture('final-playing')
        click('确认成片收讫')
        click('确认')
        capture('order-received')
        state = database('after-order')
        assert state['orders'][0]['status'] == 'received'
        assert [p['cents'] for p in state['payments'] if p['record'] == state['orders'][0]['id']] == [30000,40000,30000]
    else:
        before = database('before-restart')
        adb('shell', 'am', 'force-stop', package)
        adb('shell', 'am', 'start', '-n', package + '/com.jingjingshangri.jingjingshangri_app.MainActivity')
        wait_for_home()
        capture('after-restart')
        after = database('after-restart')
        assert before == after
    (out / (args.scenario + '-result.json')).write_text(json.dumps({'status':'PASS','serial':args.serial,'airplane_mode':True,'events':events},ensure_ascii=False,indent=2))
    print('PASS', args.scenario, flush=True)
except Exception:
    (out / (args.scenario + '-result.json')).write_text(json.dumps({'status':'FAILED','serial':args.serial,'events':events},ensure_ascii=False,indent=2))
    raise
