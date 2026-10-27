from svg_common import *

STARS=['周亦宁','何予安','陈聿','林屿']
ARTISTS=['苏禾','陈默','林夏','方宁','叶舟','许清','白露','江禾','许舟']
SKILLS=['表演','配音','表演','舞蹈','配音','表演','舞蹈','舞蹈','表演']
WORKS=['山海之间','雨巷来信','夏天的尽头','一日之间','夜行的人','沿途有光']
def star_row(s,y):
    for i,name in enumerate(STARS):
        x=18+i*90;s.add(group('StarCard-'+name,[photo(i,x+5,y,64,64,name,True,True),text(name,x+37,y+85,14,700,True,anchor='middle')]))
def artist(s,i,x,y,w=83.5,real=False):
    name=ARTISTS[i%9];pic=rect(x,y,w,w,WASH,'Authorized-Portrait-Pending') if real else photo(i+4,x,y,w,w,name,True)
    s.add(group('ArtistCard-'+name,[pic,text(name if not real else '艺人公开姓名',x,y+w+20,14,700,True,name='Title-Artist'),text('上海 · '+SKILLS[i%9],x,y+w+38,11,color=MUTED,name='Artist-Meta')]))
def work(s,i,x,y,w=173,real=False):
    frame=[rect(x,y,w,113,INK)]
    for fy in [y+2,y+107]:
        for j in range(14):frame.append(rect(x+4+j*12,fy,7,4,PAPER))
    frame.append(rect(x,y+8,w,97,WASH,'No-Cover') if real else photo(i,x,y+8,w,97,WORKS[i]))
    if real:frame += [icon('Film',x+w/2-12,y+34,24),text('封面待提供',x+w/2,y+80,12,color=MUTED,anchor='middle')]
    frame += [text(WORKS[i],x,y+134,15,700,True,name='Title-Work'),text('查看详情与预览 ↗',x,y+152,11,color=MUTED,name='Work-Link')]
    s.add(group('WorkCard-'+WORKS[i],frame))
def quick(s):
    for i,(name,ic) in enumerate([('艺人榜','Histogram'),('找机构','OfficeBuilding'),('全部','Grid')]):
        x=72+i*122;s.add(group('Quick-'+name,[icon(ic,x-12,150,24),text(name,x,193,12,anchor='middle')]))
def home(real=False):
    s=Screen('P01R' if real else 'P01','精选·当前接口状态' if real else '精选·紧凑内容版',1616,channel=0,bottom=True);quick(s)
    s.title_at('明星推荐',232,'上海 · 更多 ↗')
    if real:
        s.add(rect(18,248,354,92,WASH));s.add(text('暂无本城明星推荐',32,279,16,700,True));s.note('可以继续查看本地艺人，或切换城市。',308,x=32,width=326)
    else:star_row(s,248)
    s.add(text('当前城市 · 上海',195,355,12,color=MUTED,anchor='middle'),rect(18,372,354,.6,LINE))
    s.title_at('本地艺人',408,'全部艺人 ↗')
    for i in range(8):artist(s,i,18+(i%4)*90,426+(i//4)*136,83.5,real)
    s.add(rect(18,700,354,.6,LINE));s.title_at('作品精选',736,'全部作品 ↗')
    for i in range(6):work(s,i,18+(i%2)*181,754+(i//2)*166,173,real)
    s.title_at('同城机会',1297,'更多 ↗');s.entry('短片演员招募','上海 · 查看通告',1316,'招募');s.entry('城市影像共创','上海 · 查看详情',1384,'活动')
    s.add(text('把你的故事拍成片',18,1492,19,900,True,name='Title-Story'));s.button('写下故事',1465,268,104);s.add(text('我的故事与草稿 ↗',18,1518,12,color=MUTED))
    return s
def artists():
    s=Screen('P02','艺人频道',1140,channel=1,bottom=True);s.title_at('明星推荐',174,'上海 · 更多 ↗');star_row(s,190)
    s.add(rect(18,297,354,.6,LINE));s.title_at('本地艺人',335)
    for i,v in enumerate(['全部标签⌄','试镜展示','筛选']):s.button(v,356,18+i*121,112,False)
    for i in range(9):artist(s,i,18+(i%3)*122,420+(i//3)*169,110)
    s.button('查看更多艺人 ↗',950,primary=False);s.note('姓名、城市与特长均以公开资料为准。',1020)
    return s
def videos():
    s=Screen('P03','视频频道',1012,channel=2,bottom=True);s.title_at('作品精选',174,'全部作品 ↗');s.note('查看获准预览，购买前核对个人许可。',200)
    for i in range(6):work(s,i,18+(i%2)*181,229+(i//2)*166)
    s.add(rect(18,744,354,.6,LINE));s.title_at('从想法开始',786);s.entry('写下你的故事','定制制作 · 我的故事与草稿',807,'故事');s.note('作品不因浏览城市变化而限制购买范围。',908)
    return s
def local():
    s=Screen('P04','同城频道',1024,channel=3,bottom=True);s.title_at('同城机会',174,'上海⌄')
    cats=['全部','剧与角色','商演','商单','活动','招募','平台官方']
    for i,v in enumerate(cats):s.button(v,198+(i//3)*52,18+(i%3)*121,112,False)
    y=370
    for cat,title in [('招募','短片演员招募'),('活动','城市影像共创'),('剧与角色','都市短剧角色征集'),('商演','剧场演出合作'),('商单','品牌影像合作'),('平台官方','平台公开事项')]:y=s.entry(title,'上海 · 查看公开详情',y,cat)
    s.button('查看全部通告 ↗',824,primary=False);s.note('投稿为单向递交，感兴趣后由平台客服跟进。',900)
    return s
def city():
    s=Screen('P05','选择城市');s.field('搜索或手动输入城市','输入城市名称',132)
    s.title_at('当前浏览',251);s.add(text('上海',18,303,32,900,True,name='Title-CurrentCity'));s.note('手动选择优先，重新进入时保留选择。',334)
    s.title_at('当前位置',400);s.note('暂未获取所在城市，可直接手动选择。',432);s.button('获取当前位置 · 暂未开放',456,primary=False)
    s.title_at('热门城市',555)
    for i,v in enumerate(['北京','上海','杭州','广州','深圳','郑州']):s.button(v,578+(i//3)*52,18+(i%3)*121,112,False)
    s.button('查看全部城市',715,primary=False);s.note('无法定位时，可直接选择城市。',793)
    return s
def directory():
    s=Screen('P06','全部功能',1220);s.note('发现、办理与本人记录',127)
    y=170
    groups=[('发现',[('艺人目录','城市、标签与试镜展示筛选'),('现成作品','详情、获准预览与个人许可'),('城市榜单与机构','已公开资料与当前榜单')]),('办理',[('试镜预约','查看真实服务与可用时间'),('通告与投稿','公开详情、本人授权与单向递交'),('写下故事','保存草稿并按模板提交')]),('我的',[('故事、订单与制作','原单合同、付款与交付'),('已购作品与许可','查看原许可和获准文件'),('通知与账号身份','当前账号和办事主体')])]
    for label,items in groups:
        s.title_at(label,y);y+=22
        for title,meta in items:y=s.entry(title,meta,y+8)
        y+=28
    return s
def search():
    s=Screen('P07','查找公开内容');s.note('按内容类型进入目录，使用已有筛选。',130)
    y=180
    for title,meta in [('找艺人','城市、标签、试镜展示'),('找作品','公开作品与个人许可'),('找通告','城市、类别与有效状态')]:y=s.entry(title,meta,y)+20
    s.note('先选择内容类型，再按城市或标签筛选。',550);s.note('进入目录后，可继续筛选并查看详情。',578)
    return s
def state(key,title,message,button='重新读取',channel=None):
    s=Screen(key,title,844,channel=channel,bottom=channel is not None);y=210 if channel is not None else 165
    s.add(rect(18,y,354,192,WASH));s.add(icon('Film',174,y+26,32));s.add(text(title,195,y+105,22,900,True,anchor='middle',name='Title-State'))
    s.note(message,y+136,x=34,width=322);s.button(button,y+228,primary=False);return s
def build_main():
    return [home(),artists(),videos(),local(),city(),directory(),search(),home(True),state('S01','登录后浏览','公开目录仍需登录。登录后回到当前目录和筛选。','登录并继续',0),state('S02','正在读取','各类内容分别读取，已完成的栏目可先浏览。','返回广场',0),state('S03','本城暂无艺人','已读完全部分页，可切换城市或查看全部艺人。','选择城市',1),state('S04','作品读取失败','艺人和通告仍可浏览，重试只读取失败栏目。','重试作品',0),state('S07','本页暂无匹配','仍有下一页，请继续读取后再判断是否没有结果。','继续读取',1)]
