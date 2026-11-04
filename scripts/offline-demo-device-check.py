#!/usr/bin/env python3
"""UI-only native smoke checks for the separately installed offline demo APK.

Uses adb/UIAutomator, records screenshots and reads the demo SQLite snapshot
after UI operations. Never injects business rows or touches the online package.
The caller must explicitly supply a disposable emulator serial.
"""
import argparse
import hashlib
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
parser.add_argument('--expected-apk-sha256')
parser.add_argument('--scenario', choices=['inspect', 'blessing', 'finish', 'restart', 'artist', 'artist-import', 'artist-authorize', 'project', 'organization', 'organization-permissions', 'audition-create', 'audition-deliver', 'audition-confirm', 'notice-create', 'notice-publish', 'notice-apply', 'notice-handle'], default='inspect')
args = parser.parse_args()
if not args.serial.startswith('emulator-'):
    raise SystemExit('Only an explicitly selected disposable emulator is supported.')
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
package = 'com.jingjingshangri.jingjingshangri_app.offline'
prefix = [args.adb, '-s', args.serial]
events = []
checks = []


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


def match_node(tree, text, field=False, last=False):
    found = [n for n in tree.iter('node') if text in label(n)]
    found = [n for n in found if not n.get('resource-id', '').endswith('/preview_icon')]
    if field:
        found = [n for n in found if n.get('class') == 'android.widget.EditText']
        # Android's Flutter accessibility bridge omits empty TextField hints
        # from UIAutomator XML. The inspected form has recipient, prefilled
        # occasion, then brief; after recipient entry only brief remains empty.
        if not found and text in ['祝福对象', '祝福内容与制作要求']:
            found = [n for n in tree.iter('node') if n.get('class') == 'android.widget.EditText' and not label(n)]
    else:
        # DocumentsUI rows expose selectable content with clickable=false.
        # Tap the observed row itself, excluding its separate preview icon.
        native_rows = [n for n in found if n.get('package', '').endswith('.documentsui')]
        found = [n for n in found if n.get('clickable') == 'true']
        found = found or native_rows
        if text in ['广场', '试镜', '通告', '消息', '我的']:
            found = [n for n in found if label(n).startswith(text + '\n第 ')]
        if text == '确认':
            found = [n for n in found if label(n) == text]
    exact = [n for n in found if label(n) == text]
    return (exact or found or [None])[-1 if last else 0]


def swipe(direction):
    # The test AVD uses the documented 390 x 844 logical test display.
    y1, y2 = (690, 250) if direction == 'down' else (250, 690)
    adb('shell', 'input', 'swipe', '195', str(y1), '195', str(y2), '180')


def locate_control(text, field=False, last=False):
    tree = screen()
    node = match_node(tree, text, field, last)
    if node is None:
        for direction in ['down'] * 8 + ['up'] * 14:
            swipe(direction)
            tree = screen()
            node = match_node(tree, text, field, last)
            if node is not None:
                break
    if node is None:
        raise RuntimeError('Missing control: ' + text + '\n' + '\n'.join(label(n) for n in tree.iter('node') if label(n)))
    return node


def tap_control(node, text):
    x1, y1, x2, y2 = bounds(node)
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    events.append(text)
    print('UI:', text, flush=True)


def click(text, field=False, last=False):
    tap_control(locate_control(text, field, last), text)


def type_text(text):
    if not re.fullmatch(r'[A-Za-z0-9 ._-]+', text):
        raise ValueError('Smoke input must be simple fictional ASCII text.')
    # Slow virtual devices can drop a burst of input events. Send individual
    # characters so the native text input connection commits each one.
    for character in text:
        adb('shell', 'input', 'text', '%s' if character == ' ' else character)
        time.sleep(0.03)


def capture(name, live=False):
    if live:
        (out / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    tree = screen()
    if not live:
        (out / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    (out / (name + '.xml')).write_text(ET.tostring(tree, encoding='unicode'))


def check(name, passed, detail=None):
    checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
    print('CHECK:', name, 'PASS' if passed else 'FAIL', flush=True)
    assert passed, name


def expect_text(text):
    tree = screen()
    if not any(text in label(n) for n in tree.iter('node')):
        for direction in ['down'] * 5 + ['up'] * 10:
            swipe(direction)
            tree = screen()
            if any(text in label(n) for n in tree.iter('node')):
                break
    check('visible: ' + text, any(text in label(n) for n in tree.iter('node')))


def switch_account(actor):
    names = {'customer': '陈悦 · 普通客户', 'artist': '林夏 · 艺人本人',
             'owner': '周宁 · 机构负责人', 'member': '许安 · 机构成员',
             'producer': '顾川 · 出品方'}
    click('切换演示账号')
    click(names[actor])
    screen()
    check('account switched to ' + actor, database('account-' + actor)['actor'] == actor)


def fill_field(old, text):
    # Use the actual current native EditText content. Empty Flutter fields
    # expose no hint in UIAutomator, so use the next visible empty field.
    tree = screen()
    found = None
    for direction in ['down'] * 5 + ['up'] * 10:
        fields = [n for n in tree.iter('node') if n.get('class') == 'android.widget.EditText']
        found = next((n for n in fields if label(n) == old), None)
        if found is not None:
            break
        swipe(direction)
        tree = screen()
    if found is None:
        raise RuntimeError('Missing native field with current value: ' + old)
    x1, y1, x2, y2 = bounds(found)
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    screen()
    if old:
        current = old
        for _ in range(3):
            # Some virtual keyboards place the caret before CJK punctuation.
            # Delete on both sides, and verify empty before entering new text.
            count = len(current) + 5
            adb('shell', 'input', 'keyevent', *(['67'] * count))
            adb('shell', 'input', 'keyevent', *(['112'] * count))
            tree = screen()
            focused = [n for n in tree.iter('node') if n.get('class') == 'android.widget.EditText' and n.get('focused') == 'true']
            if not focused:
                raise RuntimeError('Native field lost focus while clearing')
            current = label(focused[0])
            if not current:
                break
        else:
            raise RuntimeError('Native field did not clear: ' + current)
    if text:
        type_text(text)
    adb('shell', 'input', 'keyevent', '4')
    tree = screen()
    focused = [n for n in tree.iter('node') if n.get('class') == 'android.widget.EditText' and n.get('focused') == 'true']
    if not focused or label(focused[0]) != text:
        raise RuntimeError('Native input did not match requested value: ' + repr([label(n) for n in focused]))
    events.append('fill field: ' + (text or '[empty]'))
    print('INPUT verified:', text or '[empty]', flush=True)


def restart_preserving(name):
    before = database(name + '-before')
    adb('shell', 'am', 'force-stop', package)
    adb('shell', 'am', 'start', '-n', package + '/com.jingjingshangri.jingjingshangri_app.MainActivity')
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            tree = screen()
            if any('晶晶日上 / 离线演示' in label(n) for n in tree.iter('node')):
                break
        except RuntimeError:
            pass
        time.sleep(0.5)
    else:
        raise RuntimeError('App did not recover after restart')
    after = database(name + '-after')
    check(name + ': all persisted state and account restored', before == after)
    capture(name + '-home')


def cancel_confirmation(action, name):
    # The preceding action must have persisted and rendered this control
    # before taking the baseline; a tap alone is not a completion signal.
    node = locate_control(action)
    before = database(name + '-before-cancel')
    tap_control(node, action)
    click('取消')
    screen()
    check(name + ': cancel leaves state unchanged', database(name + '-after-cancel') == before)


def import_file(filename, cancel_first=False):
    click('从设备导入', last=filename.endswith('.mp4'))
    if cancel_first:
        screen()
        adb('shell', 'input', 'keyevent', '4')
        screen()
        click('从设备导入', last=filename.endswith('.mp4'))
    tree = screen()
    # The standard Android DocumentsUI starts in Recent. Open Downloads if
    # the prepared local fixture has not appeared in its Recent list.
    if match_node(tree, filename) is None:
        click('Show roots')
        click('Downloads')
    click(filename)
    screen()


def verify_import(reference, filename):
    if not re.fullmatch(r'local:[0-9]+\.(jpg|jpeg|png|webp|mp4|mov|m4v)', reference):
        raise RuntimeError('Not a generated private media reference: ' + reference)
    content = adb('exec-out', 'run-as', package, 'cat',
                  'files/offline_media/' + reference[6:], binary=True)
    expected = adb('shell', 'sha256sum', '/sdcard/Download/' + filename).split()[0]
    actual = hashlib.sha256(content).hexdigest()
    check('private imported bytes match ' + filename, actual == expected,
          {'sha256': actual, 'bytes': len(content)})


def wait_for_home():
    # Activity launch can finish before Flutter publishes its accessibility
    # tree on a slow AVD. Require the actual demo home, not a fixed delay.
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            tree = screen()
            if any('晶晶日上 / 离线演示' in label(n) for n in tree.iter('node')):
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
installed = adb('shell', 'pm', 'path', package).strip().removeprefix('package:')
installed_sha256 = adb('shell', 'sha256sum', installed).split()[0]
if args.expected_apk_sha256 and installed_sha256 != args.expected_apk_sha256:
    raise SystemExit('Installed APK does not match the requested build.')
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
    elif args.scenario == 'artist':
        switch_account('artist')
        click('我的')
        click('我的艺人形象')
        before = database('artist-initial')
        click('编辑形象资料')
        fill_field(before['artist']['name'], '')
        click('保存')
        screen()
        check('empty artist name rejected', database('artist-invalid') == before)
        for _ in range(5):
            swipe('up')
        expect_text('请填写艺名')
        capture('artist-invalid-form')
        fill_field('', 'Lin Xia Native')
        import_file('jx-offline-artist.jpg', cancel_first=True)
        click('保存')
        screen()
        saved = database('artist-saved')
        check('artist profile saved as draft', saved['artist']['name'] == 'Lin Xia Native' and saved['artist']['status'] == 'draft')
        check('device image copied into private media', saved['artist']['avatar'].startswith('local:'))
        verify_import(saved['artist']['avatar'], 'jx-offline-artist.jpg')
        capture('artist-draft')
        restart_preserving('artist-draft-restart')
    elif args.scenario == 'artist-import':
        # Resume the inspected image picker without resubmitting the form or
        # discarding its already verified name and validation evidence.
        if match_node(screen(), 'jx-offline-artist.jpg') is None:
            click('Downloads')
        click('jx-offline-artist.jpg')
        click('保存')
        screen()
        saved = database('artist-saved')
        check('artist profile saved as draft', saved['artist']['name'] == 'Lin Xia Native' and saved['artist']['status'] == 'draft')
        verify_import(saved['artist']['avatar'], 'jx-offline-artist.jpg')
        capture('artist-draft')
        restart_preserving('artist-draft-restart')
    elif args.scenario == 'artist-authorize':
        switch_account('artist')
        click('我的')
        click('我的艺人形象')
        cancel_confirmation('本人授权并申请展示', 'artist-consent')
        click('本人授权并申请展示')
        click('确认')
        click('模拟形象审核通过')
        screen()
        approved = database('artist-approved')['artist']
        check('artist authorization approved', approved['status'] == 'approved')
        verify_import(approved['avatar'], 'jx-offline-artist.jpg')
        for _ in range(5):
            swipe('up')
        capture('artist-approved')
        restart_preserving('artist-approved-restart')
    elif args.scenario == 'project':
        switch_account('artist')
        click('我的')
        click('我的参演项目')
        before = database('project-initial')
        if before['project']['status'] == 'open':
            check('participation starts separately', True)
            click('报名参演')
            click('模拟筛选通过并生成约定')
        else:
            check('resume the same selected project without confirming it', before['project']['id'] == 'project-1' and before['project']['status'] == 'offered', {'resumed_from': 'offered'})
        cancel_confirmation('本人确认参演约定', 'project-contract')
        click('本人确认参演约定')
        click('确认')
        click('模拟出品方付款')
        click('模拟更新：开始拍摄')
        click('模拟更新：拍摄完成')
        screen()
        state = database('project-completed')
        check('project completed with one simulated payment', state['project']['status'] == 'completed' and len([p for p in state['payments'] if p['record'] == state['project']['id']]) == 1)
        capture('project-completed')
        restart_preserving('project-restart')
    elif args.scenario == 'organization':
        tree = screen()
        is_editing = any(label(n) == '编辑机构资料' and n.get('clickable') == 'false' for n in tree.iter('node')) and any(n.get('class') == 'android.widget.EditText' for n in tree.iter('node'))
        if is_editing:
            before = database('organization-initial')
            check('resume only the unsaved owner form', before['actor'] == 'owner')
            current_name = next(label(n) for n in tree.iter('node') if n.get('class') == 'android.widget.EditText')
        else:
            switch_account('owner')
            click('我的')
            click('我的机构')
            before = database('organization-initial')
            click('编辑机构资料')
            current_name = before['organization']['name']
        fill_field(current_name, 'Qingchuan Native')
        click('保存')
        screen()
        check('organization profile saved', database('organization-saved')['organization']['name'] == 'Qingchuan Native')
        cancel_confirmation('邀请许安加入机构', 'organization-invite')
        click('邀请许安加入机构')
        click('确认')
        screen()
        check('invitation awaiting same member', database('organization-invited')['organization']['memberStatus'] == 'invited')
        invited = database('organization-invitation-name')
        check('invitation records the edited organization name', invited['organization']['history'][-1]['text'] == 'Qingchuan Native邀请许安加入')
        switch_account('member')
        click('我的')
        click('我的机构')
        expect_text('Qingchuan Native')
        click('接受机构邀请')
        screen()
        state = database('organization-accepted')
        check('member accepted same organization', state['organization']['name'] == 'Qingchuan Native' and state['organization']['memberStatus'] == 'active')
        capture('organization-member-accepted')
        restart_preserving('organization-accepted-restart')
    elif args.scenario == 'organization-permissions':
        switch_account('owner')
        click('我的')
        click('我的机构')
        click('设置成员权限')
        click('查看艺人资料')
        click('协助试镜')
        click('保存权限')
        screen()
        state = database('organization-permissions')
        check('both permissions persisted', set(state['organization']['permissions']) == {'查看艺人资料', '协助试镜'})
        switch_account('member')
        click('我的')
        click('我的机构')
        expect_text('可协助整理试镜安排')
        capture('organization-member-permissions')
        switch_account('owner')
        click('我的')
        click('我的机构')
        cancel_confirmation('移除成员', 'organization-remove')
        click('移除成员')
        click('确认')
        switch_account('member')
        click('我的')
        click('我的机构')
        expect_text('当前未加入机构')
        state = database('organization-removed')
        check('revocation takes effect across accounts', state['organization']['memberStatus'] == 'removed' and not state['organization']['permissions'])
        capture('organization-member-revoked')
        restart_preserving('organization-removed-restart')
    elif args.scenario == 'audition-create':
        switch_account('customer')
        click('试镜')
        click('预约试镜')
        before = database('audition-before-create')
        click('提交预约')
        expect_text('请填写试镜要求')
        check('empty audition requirements rejected', database('audition-invalid') == before)
        capture('audition-invalid-form')
        fill_field('', 'Native audition for a short film')
        click('提交预约')
        screen()
        row = database('audition-created')['auditions'][0]
        check('audition created without implicit payment', row['status'] == 'unpaid')
        cancel_confirmation('模拟支付试镜费用', 'audition-payment')
        click('模拟支付试镜费用')
        click('确认')
        screen()
        state = database('audition-paid')
        check('one audition payment recorded', state['auditions'][0]['id'] == row['id'] and state['auditions'][0]['status'] == 'paid' and len([p for p in state['payments'] if p['record'] == row['id']]) == 1)
        capture('audition-paid')
        restart_preserving('audition-paid-restart')
    elif args.scenario == 'audition-deliver':
        switch_account('artist')
        click('试镜')
        row = database('audition-artist-sees')['auditions'][0]
        click('试镜 ' + row['id'])
        expect_text('预约 ' + row['id'])
        click('接受试镜预约')
        click('提交试镜样照与视频')
        import_file('jx-offline-artist.jpg')
        for _ in range(2):
            swipe('down')
        import_file('jx-offline-audition.mp4')
        click('提交试镜素材')
        click('模拟试镜素材审核通过')
        click('播放本地视频')
        capture('audition-artist-playing', live=True)
        state = database('audition-ready')
        result = state['auditions'][0]
        check('same audition has imported photo and video', result['id'] == row['id'] and result['status'] == 'ready' and result['photo'].startswith('local:') and result['video'].startswith('local:'))
        verify_import(result['photo'], 'jx-offline-artist.jpg')
        verify_import(result['video'], 'jx-offline-audition.mp4')
        restart_preserving('audition-ready-restart')
    elif args.scenario == 'audition-confirm':
        switch_account('customer')
        click('试镜')
        row = database('audition-customer-sees')['auditions'][0]
        verify_import(row['photo'], 'jx-offline-artist.jpg')
        verify_import(row['video'], 'jx-offline-audition.mp4')
        click('试镜 ' + row['id'])
        expect_text('预约 ' + row['id'])
        click('播放本地视频')
        capture('audition-customer-playing', live=True)
        cancel_confirmation('确认试镜交付', 'audition-confirmation')
        click('确认试镜交付')
        click('确认')
        screen()
        state = database('audition-completed')
        check('customer completed the same audition', state['auditions'][0]['id'] == row['id'] and state['auditions'][0]['status'] == 'completed')
        capture('audition-completed')
        restart_preserving('audition-completed-restart')
    elif args.scenario == 'notice-create':
        switch_account('producer')
        click('通告')
        click('发布新通告')
        before = database('notice-initial')
        click('保存通告草稿')
        screen()
        check('empty notice rejected', database('notice-invalid') == before)
        for _ in range(5):
            swipe('up')
        expect_text('请填写通告标题')
        capture('notice-invalid-form')
        fill_field('', 'Native Casting')
        fill_field('', 'Bookshop Clerk')
        fill_field('', 'A short film in Suzhou')
        fill_field('', 'Portrait and audition video required')
        click('保存通告草稿')
        screen()
        row = database('notice-draft')['notices'][0]
        check('notice draft persisted', row['status'] == 'draft' and row['title'] == 'Native Casting')
        switch_account('artist')
        click('通告')
        expect_text('等待一份新的邀请')
        capture('notice-private-draft')
        switch_account('producer')
        click('通告')
        click('Native Casting')
        cancel_confirmation('确认发布条件并提交', 'notice-conditions')
        click('确认发布条件并提交')
        click('确认')
        click('模拟退回修改')
        screen()
        state = database('notice-rejected')
        check('review rejection preserves same notice', state['notices'][0]['id'] == row['id'] and state['notices'][0]['status'] == 'rejected')
        capture('notice-rejected')
        restart_preserving('notice-rejected-restart')
    elif args.scenario == 'notice-publish':
        switch_account('producer')
        click('通告')
        click('Native Casting')
        click('编辑通告资料')
        fill_field('A short film in Suzhou', 'Revised short film in Suzhou')
        fill_field('Portrait and audition video required', 'Adult performer. Portrait and audition video required')
        click('保存通告草稿')
        click('确认发布条件并提交')
        click('确认')
        click('模拟审核通过并发布')
        screen()
        row = database('notice-published')['notices'][0]
        check('revised notice published', row['status'] == 'published' and row['brief'] == 'Revised short film in Suzhou' and row['requirements'] == 'Adult performer. Portrait and audition video required')
        capture('notice-published')
        restart_preserving('notice-published-restart')
    elif args.scenario == 'notice-apply':
        switch_account('artist')
        click('通告')
        row = database('notice-artist-sees')['notices'][0]
        click('Native Casting')
        expect_text('Revised short film in Suzhou')
        click('提交我的艺人资料')
        fill_field('', 'Interested in the bookshop role')
        before = database('application-before-consent')
        click('确认投稿')
        screen()
        check('submission without consent rejected', database('application-no-consent') == before)
        click('本人同意向此通告提交当前艺人资料')
        click('确认投稿')
        screen()
        state = database('application-created')
        application = state['applications'][0]
        check('submission uses same notice and artist snapshot', application['notice'] == row['id'] and application['status'] == 'pending' and application['artistSnapshot']['name'] == state['artist']['name'] and application['artistSnapshot']['avatar'] == state['artist']['avatar'])
        capture('application-created')
        restart_preserving('application-pending-restart')
    elif args.scenario == 'notice-handle':
        switch_account('producer')
        click('通告')
        before = database('application-producer-sees')
        application = before['applications'][0]
        click('Native Casting')
        click(application['artistSnapshot']['name'])
        click('感兴趣 · 转客服跟进')
        screen()
        state = database('application-interested')
        check('producer handled the same application', state['applications'][0]['id'] == application['id'] and state['applications'][0]['status'] == 'interested' and bool(state['applications'][0].get('serviceTask')))
        check('interest does not change participation or charge', state['project'] == before['project'] and state['payments'] == before['payments'])
        capture('application-producer-handled')
        switch_account('artist')
        click('通告')
        click('Native Casting')
        click('查看我的投稿')
        expect_text('模拟客服待办')
        capture('application-artist-result')
        restart_preserving('application-handled-restart')
    elif args.scenario == 'restart':
        before = database('before-restart')
        adb('shell', 'am', 'force-stop', package)
        adb('shell', 'am', 'start', '-n', package + '/com.jingjingshangri.jingjingshangri_app.MainActivity')
        wait_for_home()
        capture('after-restart')
        after = database('after-restart')
        assert before == after
    else:
        raise RuntimeError('Scenario has not been implemented: ' + args.scenario)
    (out / (args.scenario + '-result.json')).write_text(json.dumps({'status':'PASS','serial':args.serial,'airplane_mode':True,'apk_sha256':installed_sha256,'events':events,'checks':checks},ensure_ascii=False,indent=2))
    print('PASS', args.scenario, flush=True)
except Exception:
    (out / (args.scenario + '-result.json')).write_text(json.dumps({'status':'FAILED','serial':args.serial,'apk_sha256':installed_sha256,'events':events,'checks':checks},ensure_ascii=False,indent=2))
    raise
