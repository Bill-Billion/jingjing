# 05 我的：官方高保真上下文精校
依据Figma文件iycd9D7RrESCJ9c6GbLOMo、节点4016:6960的官方get_design_context及随附截图。返回完整上下文，非sparse。目标屏4016:6962为390×844，外部评审列标签不属于手机屏幕。
修改前已库外备份。仅修改pages-home.js的05 renderer、新增calibration-05.css与assets/figma/05-*八素材。静态比较01–04及导出前缀未变，App、共享style.css、app.js、index.html均未修改。
## 已落
- 独立44状态栏、180个人头、716滚动内容、84底导航；背景#25312b/#1c2420/#101513，文字#f2f5ef，次级#a5aea8，分隔#34403a，选中点#b9f34a。
- 原头像56×56/圆角12，原settings24×24、status64×64及五个导航24×24SVG保持root尺寸；无重画或字符替代。
- 目录70、资金100高，标题28/36，目录20/28，说明12/18，资金16/20；保持原文、原设计示例姓名与金额。
- 手机外明确“Figma 原稿静态样板 · 人物、认证与金额均为示例，非真实账目”，导航/设置禁用，无真实账号或财务读取。
- 按工具要求curl -L下载原素材，全部非空；运行引用仅本地路径，不使用临时URL。截图仅作视觉目标，不作页面素材。

## 集成及未验边界
需要在style.css之后加载calibration-05.css，尚未由本批改index。局部规则只作用data-page=05，隐藏通用状态栏/安全区并使用完整05框架。
沿用本地PreviewNoto字体；原稿Inter及Noto Serif SC没有已确认的同名字体文件，CSS保留指定名称并回退，数字/箭头字形仍需视觉核查。不擅自下载未知字体或用相似图片。
尚未浏览器渲染核对：有效素材几何、字体、截图差异及小屏行为待仅05只读视觉比较。代码尺寸与静态资产槽位已核，不声明像素一致或验收完成；没有测试、编译、启动服务或实际App改动。
## 本地资产
- 05-audition.svg: 679 bytes; SHA256 9ea10ceae47e89f06fbe34ace2c789531a18c6cb3fbf06b2847ec73a3f4db1dc
- 05-avatar.png: 1904600 bytes; SHA256 c437e4fe73c51ff5c8f200c7f5a4dfdbd7301d6038f1f48739890adf9c8964fb
- 05-message.svg: 450 bytes; SHA256 ad52b6c22f9ca64239396836a35da4723e264cfd7b1d529027b2ece284e9cd16
- 05-my.svg: 685 bytes; SHA256 e979fe69b0225fe4625824acc7743b1f9dba3fb91f756542f05451989f08cbb0
- 05-notice.svg: 341 bytes; SHA256 dd3332ded04e974925b21530b374d4f75d295cc32acda8581497e23594101e1b
- 05-settings.svg: 620 bytes; SHA256 2b4cc99feb7ee843045de329903af4b164aeb2d1a9edf3d5ecd3c817996b80ab
- 05-square.svg: 704 bytes; SHA256 d9fae8d46301398179b923d9f99b0e6961448b7e5f377bf7c3be702ed88996b5
- 05-status.svg: 922 bytes; SHA256 8b0bd16d208d3b73683e457ffcc8f3fcf5630b1203f19ac49555245831d57f11

## 官方字体补齐
仓库及系统未找到确切Inter/Noto Serif SC。已从官方Google Fonts获取Inter可变完整字体与Noto Serif SC Bold官方文本子集（含原箭头），OFL1.1许可证与版本来源保存在assets/fonts/FONT_SOURCES.md。仅05 scoped字体别名接入，无系统安装，无63样式改动。Inter文件可供63复用。原稿未给字体二进制版本，不能声称历史字库版本完全相同；当前字形/字重不再主动用近似字体，仍待浏览器加载与截图比较。

## 集成复核更新
已在本地 Chrome 查看05顶部/底栏及63顶部/底部。所有14项原始素材文件非空，状态SVG64、导航图标24（05）/20（63）、头像56、海报350×525裁切到350×180、选项图标18的浏览器有效几何已核。05官方Noto Serif SC箭头与Inter数字字体已接入，63复用Inter；截图字形变化已查看，未确认Figma历史字体二进制版本。仅静态视觉检查，不是Flutter渲染或功能验收，不称逐像素一致。
