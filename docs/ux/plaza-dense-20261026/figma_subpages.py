"""Editable secondary screens; follows the existing API and permission flows."""
from svg_common import Screen, text, rect, photo, icon, group, PAPER, INK, RED, MUTED, LINE, WASH


def _end(screen):
    screen.add(rect(151, screen.height - 10, 88, 3, INK, name='Home-Indicator', rx=1.5))
    return screen


def _fact(screen, label, value, y):
    screen.add(text(label, 18, y, 12, color=MUTED))
    end = screen.note(value, y, x=110, size=14, width=262)
    screen.add(rect(18, end + 5, 354, .6, LINE))
    return end + 28


def _check(screen, value, y, checked=False):
    screen.add(rect(18, y, 18, 18, RED if checked else PAPER, stroke=RED if checked else LINE, stroke_width=1))
    if checked:
        screen.add(text('✓', 21, y + 14, 13, 700, color='#FFFFFF'))
    return screen.note(value, y + 15, x=48, size=14, width=324) + 14


def _artist_filter():
    s = Screen('P08', '艺人筛选')
    s.title_at('找到合适的面孔', 142)
    s.note('城市、标签与试镜展示状态分别筛选。', 173, size=14)
    y = s.field('城市', '上海', 235)
    y = s.field('标签', '表演', y + 20)
    y = _check(s, '只看已开放试镜展示的艺人', y + 16)
    s.note('公开展示不等于当前有档期。\n预约前仍需核对具体试镜方案与本单用途。', y + 18, size=14)
    s.button('按条件查看艺人', 650)
    s.button('重置筛选条件', 706, primary=False)
    return _end(s)


def _artist_detail():
    s = Screen('P09', '艺人详情', height=1150)
    s.add(photo(4, 192, 118, 180, 228, 'Artist-Portrait', portrait=True))
    s.add(text('苏禾', 18, 181, 32, 900, True))
    s.note('上海 · 表演', 216, width=156, size=14)
    s.note('当前认证 L1', 251, width=156)
    s.note('公开资料', 311, width=156)
    s.add(rect(18, 366, 354, .6, LINE))
    s.title_at('关于这位艺人', 409)
    s.note('以公开介绍呈现经历、擅长方向与作品。\n形象、声音与数字人的商用权另行授权。', 446, size=14)
    s.title_at('作品与声音', 553)
    s.note('每份预览在读取时重新核对当前公开授权。', 586, size=14)
    s.add(photo(0, 18, 625, 354, 148, 'Approved-Preview'))
    s.button('读取获准预览 1', 792, primary=False)
    s.button('重新核权并保存预览 1', 848, primary=False)
    s.button('查看公开试镜方案', 925)
    s.note('试镜方案以本人已审核公开的目录为准。\n预约前核对具体艺人与本单用途。', 1003, size=14)
    return _end(s)


def _stock_detail():
    s = Screen('P10', '作品详情', height=1440)
    s.add(photo(0, 18, 116, 354, 199, 'Work-Approved-Cover'))
    s.title_at('山海之间', 356)
    s.note('上海 · 已完成作品', 386, size=12)
    s.note('作品介绍由当前已审资料提供。\n先查看获准预览，再核对本版个人使用许可。', 420, size=14)
    s.button('读取已审预览', 488, primary=False)
    s.title_at('价格与本版许可', 584)
    y = _fact(s, '本版价格', '按当前已审价格显示', 626)
    y = _fact(s, '许可', '个人非商用 · 非独家\n全球 · 永久', y)
    y = _fact(s, '允许范围', '个人收藏及个人社交分享\n仅限本单购买人使用', y)
    y = _fact(s, '不包含', '广告、改编、发行、声音拆用、\n再生成、新数字人内容、源文件、\n模型和独家买断', y)
    y = _fact(s, '核对期限', '按本单约定的收件后核对时限', y)
    y = _fact(s, '售后约定', '依本版许可与原订单办理', y)
    y = _check(s, '我已阅读本版价格、个人许可与售后约定', y + 6)
    y = s.field('订单约定支付渠道', '支付宝', y + 12)
    y = s.note('确认后建立原订单。是否付款及许可是否生效，\n以原订单实际核实结果为准。', y + 2, size=14)
    s.button('确认本版购买并查看原订单', y + 12)
    s.button('重新读取本页', y + 68, primary=False)
    return _end(s)


def _preview():
    s = Screen('P11', '获准预览')
    s.add(photo(0, 18, 123, 354, 199, 'Approved-Video'))
    s.add(rect(155, 195, 80, 48, INK, opacity=.78))
    s.add(icon('VideoPlay', 181, 207, 24, PAPER))
    s.title_at('山海之间', 370)
    s.note('获准预览', 403)
    s.note('预览不授予完整作品、形象或声音的商用权。\n购买前请返回详情核对本版价格与个人许可。', 449, size=14)
    s.button('暂停预览', 551, primary=False)
    s.button('重新读取已审预览', 607)
    s.note('无法实际打开时显示读取失败，\n不将文件读取或播放失败记为已查看。', 698, size=12)
    return _end(s)


def _purchase_confirm():
    s = Screen('P12', '作品详情')
    s.add(photo(0, 18, 116, 354, 199, 'Work-Behind-Dialog'))
    s.add(rect(0, 95, 390, 749, INK, opacity=.23))
    s.add(rect(18, 146, 354, 583, PAPER, stroke=LINE, stroke_width=1))
    s.add(text('按本版许可购买', 38, 191, 24, 900, True))
    s.note('山海之间', 232, x=38, size=17, width=314)
    s.note('确认当前已审价格和个人使用许可。', 270, x=38, size=14, width=314)
    s.add(rect(38, 297, 314, .6, LINE))
    s.note('个人非商用 · 非独家 · 全球 · 永久\n允许本人收藏及个人社交分享。\n广告、改编、发行、声音拆用、再生成、\n源文件、模型及独家买断不包含在内。', 332, x=38, size=14, width=314)
    s.note('提交后建立原订单。\n付款与许可生效仍以核实结果为准。\n结果待核对时恢复原请求，避免重复下单。', 466, x=38, size=14, width=314)
    s.button('取消', 629, x=38, w=146, primary=False)
    s.button('确认并查看原订单', 629, x=196, w=156)
    return _end(s)


def _notices_catalog():
    s = Screen('P13', '通告目录', height=1380)
    s.title_at('找到下一次合作', 143)
    s.note('六类公开通告，按城市与有效时间浏览。', 177, size=14)
    labels = [('全部',18,88),('剧与角色',106,88),('商演',194,88),('商单',282,90),
              ('活动',18,118),('招募',136,118),('平台官方',254,118)]
    for i,(label,x,w) in enumerate(labels):
        y = 211 if i < 4 else 261
        s.add(rect(x,y,w,44,PAPER,stroke=LINE,stroke_width=.6))
        s.add(text(label,x+w/2,y+28,14,700 if i==0 else 400,color=RED if i==0 else INK,anchor='middle'))
    y = s.field('城市（可留空）', '上海', 347)
    y = s.field('指定有效时间（可留空）', '请选择日期时间', y + 6)
    s.button('筛选通告', y + 2, primary=False)
    y += 84
    for title,kind in [('短片演员招募','招募'),('城市影像共创','活动'),('都市短剧角色征集','剧与角色'),('剧场演出合作','商演'),('品牌影像合作','商单'),('平台公开事项','平台官方')]:
        y = s.entry(title, '上海 · 查看要求与截止时间', y, category=kind)
    s.button('核对资格并发布通告', y + 16)
    s.button('我的投稿与接收箱', y + 72, primary=False)
    s.button('我的已发通告', y + 128, primary=False)
    s.button('合作客服处理', y + 184, primary=False)
    return _end(s)


def _notice_detail():
    s = Screen('P14', '通告详情', height=1100)
    s.add(text('招募 / 上海', 18, 137, 12, 500, color=RED))
    s.title_at('短片演员招募', 184)
    s.note('请按本通告明确的角色与合作条件投递。\n通告由发布方提交，经独立审核后公开。', 221, size=14)
    y = 307
    for label,value in [('类型','招募'),('城市','上海'),('招募岗位或角色','以本通告的明确角色说明为准'),('招募要求','经历、技能与参与条件按发布内容核对'),('开始时间','按本通告有效开始时间显示'),('截止时间','按本通告有效截止时间显示')]:
        y = _fact(s,label,value,y)
    s.note('投稿仅单向递交，不自动付款、签约、\n授角或开放自由聊天。', y + 6, size=14)
    s.button('投递形象与模卡', y + 81)
    s.button('投递想演角色', y + 137, primary=False)
    s.button('提交自己做剧的意向', y + 193, primary=False)
    return _end(s)


def _submission(key, kind):
    names = {'PROFILE':'形象与模卡投稿','ROLE':'角色投稿','CREATE_DRAMA':'做剧意向投稿'}
    s = Screen(key, names[kind], height=1300 if kind=='ROLE' else 1200)
    s.title_at('投递这一次可能', 143)
    s.note('本人授权 · 单向递交 · 平台客服跟进', 177)
    s.add(rect(18, 202, 354, 93, WASH))
    s.add(text('明确接收的通告', 32, 230, 13, 500))
    s.add(text('短片演员招募', 32, 259, 17, 700, True))
    s.add(text('招募 · 截止以当前通告记录为准', 32, 282, 12, color=MUTED))
    y = s.field('选择本次具体真人', '苏禾', 338)
    y = s.field('选择本人对明确接收方的已审授权', '苏禾 · 本次合作投稿授权', y + 5)
    y = s.field('本次投稿用途', '填写本次真实用途', y + 5)
    y = s.field('给接收方的投稿内容', '介绍经历、特长与本次合作意向', y + 5, multiline=True)
    if kind=='ROLE':
        y = s.field('想演的明确角色', '填写通告中的具体角色', y + 5)
    s.add(text('本次私有模卡或材料', 18, y + 6, 13, 500))
    s.add(rect(18, y + 20, 354, 82, PAPER, stroke=LINE, stroke_width=1))
    s.add(icon('Document', 36, y + 45, 24))
    s.add(text('选择并上传本次材料', 76, y + 58, 14))
    y = s.note('材料仅供本次明确接收方核对，\n不因上传而成为公开作品。', y + 129, size=12)
    y = s.note('提交后等待独立审核；对方感兴趣时交给客服。\n当前没有覆盖授权时，先办理本人同意。', y + 18, size=12)
    s.button('提交本次单向投稿审核', y + 14)
    return _end(s)


def _submission_result():
    s = Screen('P18', '投稿与客服进度', height=1110)
    s.add(text('当前状态', 18, 138, 12, 500, color=RED))
    s.title_at('等待独立审核', 182)
    s.note('以本投稿当前记录为准。\n审核后才会按规则单向送达接收方。', 220, size=14)
    y = 310
    for label,value in [('本次投稿','角色投稿'),('具体真人','本次指定真人'),('具体数字人','本次已授权数字人'),('用途','投递本通告明确角色'),('内容','本次单向合作意向'),('角色','以本次实际投稿内容显示'),('截止','以服务器记录的有效截止时间显示')]:
        y = _fact(s,label,value,y)
    y = s.note('感兴趣只生成平台客服待办。\n没有自由聊天、付款、签约或授角事实。', y + 10, size=14)
    s.button('重新读取', y + 12, primary=False)
    s.button('我的投稿与接收箱', y + 68, primary=False)
    y = s.field('撤回原因', '请说明撤回本记录的原因', y + 148, multiline=True)
    s.button('明确撤回本记录', y + 2, primary=False)
    return _end(s)


def _rights_unavailable():
    s = Screen('S05', '公开资料')
    s.add(rect(18, 132, 354, 170, WASH))
    s.add(icon('Document', 173, 190, 44, MUTED))
    s.title_at('这份资料当前不可用', 360)
    s.note('当前读取未获许可，已停止展示这份资料。\n可以返回目录，查看其他当前可用内容。', 405, size=14)
    s.button('返回目录重新读取', 610)
    s.note('未登录或身份失效时，沿原登录入口核对。', 699)
    return _end(s)


def _quote_expired():
    s = Screen('S06', '作品详情')
    s.add(rect(18, 132, 354, 118, WASH))
    s.add(text('本版价格或许可已变化', 34, 170, 17, 700, True))
    s.note('请重新读取作品后核对当前版本。', 210, x=34, size=14, width=322)
    s.title_at('重新确认本版许可', 323)
    s.note('原来的已读勾选已清除。\n重新读取后，再确认当前价格、许可和售后约定。', 365, size=14)
    _check(s, '我已阅读本版价格、个人许可与售后约定', 460)
    s.add(rect(18, 540, 354, 44, WASH, stroke=LINE, stroke_width=1))
    s.add(text('重新核对后才能确认购买', 195, 568, 14, color=MUTED, anchor='middle'))
    s.button('重新读取本页', 625)
    s.button('返回作品目录', 681, primary=False)
    return _end(s)


def build_subpages():
    return [_artist_filter(), _artist_detail(), _stock_detail(), _preview(), _purchase_confirm(),
            _notices_catalog(), _notice_detail(), _submission('P15','PROFILE'),
            _submission('P16','ROLE'), _submission('P17','CREATE_DRAMA'),
            _submission_result(), _rights_unavailable(), _quote_expired()]


if __name__ == '__main__':
    import json
    import xml.etree.ElementTree as ET
    result=[]
    for screen in build_subpages():
        root=ET.fromstring(screen.finish())
        texts=root.findall('.//{http://www.w3.org/2000/svg}text')
        bottoms=[float(n.attrib.get('y',0)) for n in texts]
        assert max(bottoms,default=0) < screen.height - 20, (screen.key, max(bottoms), screen.height)
        result.append({'key':screen.key,'title':screen.title,'height':screen.height,'text_nodes':len(texts),'max_text_y':max(bottoms,default=0)})
    print(json.dumps(result,ensure_ascii=False,indent=2))
