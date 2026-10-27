# 紧凑广场、选城与发现入口逐图验收

2026-10-27。本侧负责主页及其直接发现入口。实际打开 PNG 检查，未用 ARIA 或自动脚本的 PASS 代替视觉检查，也未控制 Figma 网页。详情、购买、投稿等完整业务页面另由子页验收记录负责。

## 当前结论与版本

已实际查看 Figma 的 P01、P01R、P02—P07 八张导出图，以及应用 320×844、390×844、768×1024 的频道、选城、搜索及全部功能截图。四频道、四列/三列人物矩阵、唯一六格作品矩阵和数据缺口状态均可辨读；中途滚动截图的内容裁切可在末段截图中恢复，不是底栏压住了无法操作的内容。

初次实拍发现的间距、重复动作、入口行结构、图标字形及试镜城市传参问题，已在统一重建后的三宽图片中复验通过。修后图保留真实接口状态：7位获准艺人、6个全国作品，无明星名单与正式封面。末次复核发现的私有入口“公开”标签及Figma误写“可约试镜”也已修正，并读回原Figma导出与最终文字版三宽实拍。本侧未再发现影响这组页面验收的前端问题。

- `channels-*` 初轮基于 bundle `abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03`。
- `city-*-final-copy-*`、`search-directory-*-final-copy-*` 基于文案版 bundle `26d1d0e9102a28d36964ffc27211234dc6f27d7d8acbab3cb8857778ed513d5b`。
- 文案版三宽已实际显示新的城市页脚和两句搜索提示，旧文案不再计为未修。
- `*-visual-final-*` 与 `search-directory-*-visual-final-recheck-*` 基于统一视觉修正版 bundle `b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c`。本侧实际打开67张修后截图；另9张搜索与全部目录目的页经SHA-256核对内容相同。具体文件见末节。此版本仍显示末次复核前的“公开”小标签，不能冒充已改“入口”的截图。
- `search-directory-*-visual-entry-final-*` 基于最终文字版 bundle `0f38bca110bb0d9828a661e746d1ae65117d3ad4ef1bd339ad3f947ad57da123`。三宽搜索及全部功能12张已逐图查看，固定标签均为“入口”；另24张目的页与此前已看修后图SHA-256相同，逐张对应见末节。末次文字变更未改路由或权限。
- 最新原Figma P06/P07导出已重新实际打开，确认“入口”及“试镜展示”口径；Figma版本为“2026-10-27｜紧凑广场交付稿·试镜展示口径”。
- 具体运行及后续新构建以[覆盖表](../../testing/plaza-dense-20261026/api/COVERAGE.md)为准；上述旧图保留其原版本，不冒充修后截图。

## 逐项对照

| 检查项 | 实际看见的结果 | 判断 |
| --- | --- | --- |
| 纸色、墨黑、深朱红按钮 | 各宽度背景连续，栏目与品牌采用重宋体，元数据为较轻的无衬线；写故事按钮为深朱红白字，频道和选中状态用亮朱红。 | 方向一致；字重判断同时依靠已有字体定义，不能仅凭截图声称每个字形逐像素相同。 |
| 精选页人物密度 | 修后三宽均为4列、7位真实合成记录，第二行3位；姓名、城市与特长跟随人物。320宽较长姓名显示省略号，标签仍可读，未横向溢出。 | 满足紧凑浏览目标；撤权后的第8位不补造。 |
| 艺人频道 | 三宽为3列，末行按真实人数排列，筛选行在320宽自然换成两行。 | 满足三列与窄屏可读；无需用假人物填满最后一行。 |
| 作品精选 | 精选与视频频道各显示两列、三行共6个不同作品；同一个页面内没有另一个“本期精选/现成作品”重复大模块。 | 通过；连续截图之间的重叠不是页面重复渲染。 |
| 缺明星、封面、定位 | 明星显示未有本城推荐，获准人物照正常读取；六个作品保留胶片槽并写“封面待提供”；选城页定位动作禁用并提供手动选择。 | 真实能力边界清楚，没有拿 Figma 概念肖像或景片冒充实际记录。 |
| 同城机会 | 三宽显示后端真实六类及“全部”；320/390自然换行，768可容纳更多同排按钮；列表标题与地区清楚。 | 通过；按真实类别替代原概念中的不对应类别。 |
| 城市改变与恢复 | “合成无结果”只清空本地艺人和通告，作品全国池仍为6个；恢复郑州后重新出现真实人物。 | 视觉结果与既定全国作品池规则一致。 |
| 320/390/768适配 | 320刊头分两行，避免压缩品牌或搜索/身份；768主频道居中限宽。末段故事动作和同城查看动作均能完整滚到可见。 | 没有发现横向溢出、永久遮挡或无法读完的栏目。 |
| 搜索与全部功能 | 三宽具有返回；新行有方点、64px短左栏、“入口”中性标签、标题与元数据、细线和同源箭头；搜索可进入艺人/作品/通告目录，全部可进入目录、试镜和已购等真实页面。子页未复制五底栏。 | 布局、文字及目的页通过。返回行为另由浏览器流程和导航测试证明，静态图片本身不证明一次点击成功。 |

## 实拍发现及处理

| 编号 | 实际差异与证据 | 已实施处理 | 最终实拍状态 |
| --- | --- | --- | --- |
| VH01 | 精选快捷入口到明星标题比 P01R 更松。见 [390首屏](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-selected-00.png) 与 [P01R](../../ux/plaza-dense-20261026/figma-evidence/P01R.png)。 | 快捷区底部逻辑 padding 减16px，首页首个标题 top 减4px，合计20px；未将系统状态栏计入间距。 | 三宽修后通过，见[390修后](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-selected-00.png)。 |
| VH02 | 明星空态比 P01R 多了“查看全部艺人”动作，与本地艺人栏目入口重复。 | 删除该动作，保持92px最小空态框；下面的艺人入口及选城仍可达。 | 三宽修后通过，未再见重复动作。 |
| VH03 | P06/P07的Figma行带“朱红方点＋公开”左栏和细线，应用最初用普通左对齐行。见 [全部](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-all-functions-00.png)、[搜索](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-search-00.png)。 | 两页复用紧凑入口行，左栏64px，390画布标题起点约x82；补方点、短标签、元数据及细线，更多真实业务入口和路由保留。 | 三宽结构通过，见[全部修后](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-all-functions-00.png)、[搜索修后](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-search-00.png)。末次标签语义另见VH07。 |
| VH04 | Material图标轮廓与Figma不同，390艺人首图中“☷”还有一次缺字框，滚动图恢复。 | 使用与Figma同一Element Plus源制作的EditorialIcons字形；刊头、工具、筛选、入口箭头、作品缺图和五底栏统一；“☷/⌄”改为真正图标，plaza主题保留BackButton语义并换同源箭头。 | 三宽修后通过；艺人筛选图标不再缺字。原稿本来就是文本的“↗”链接附记保留。 |
| VH05 | 全部→试镜虽传city，目录截图输入仍空。只读定位为app.dart此前忽略query。见 [试镜目的页](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-directory-auditions-catalog-00.png)。 | 主代理让canonical及旧alias都承接initialCity；新增两项命名路由→实际Dio GET查询值及输入回显检查通过。 | 修后三宽实际城市框均为郑州并展示方案，见[390修后](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-directory-auditions-catalog-00.png)；浏览器流程另校验canonical、city查询及真实200，不把单元测试当真实HTTP证据。 |
| VH06 | 旧选城/搜索页曾含接入能力等实施说明。 | 三句改成面向使用者的选城/筛选提示；文案版三宽已经实拍读回。 | 文案项已通过；后续样式复验仍采用新图。 |
| VH07 | b95的全部功能页把本人订单、草稿等私有入口也标为“公开”，容易误解资料公开范围。 | 共享行固定标签改为中性“入口”，P06/P07统一；Figma同源同步该短标签，不动权限说明、路由或数据。必要语义目标测试1项通过。 | 最终文字版三宽12张通过，见[搜索](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-entry-final-search-00.png)、[本人入口](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-entry-final-all-functions-01.png)；原Figma P06/P07亦已读回“入口”。 |
| VH08 | 更新标签后的原Figma P06仍写“可试镜筛选”，P07写“可约试镜”，而目录的audition_public仅表示开放试镜展示。应用实际已用“试镜展示”。 | 主代理在原Figma及同源导入文件中将两处副标题同步为“试镜展示”，保留真正预约业务的独立入口，不再把展示条件当档期承诺。 | 最新[P06](../../ux/plaza-dense-20261026/figma-evidence/P06.png)、[P07](../../ux/plaza-dense-20261026/figma-evidence/P07.png)实际读回通过，无需再次修改或构建应用。 |

上述新增视觉修正及路由衔接的针对检查共38项通过：plaza18、主壳导航12、制作入口6、试镜路由2；定向Dart分析通过。主代理负责汇总全套CI及最终构建结果，这个数字不代替全套验证。

## 可接受的数据及运行差异

- Figma P01/P02 的人物、作品和上海仅为概念示例；本机沙箱是郑州、合成人形图和明确标注的合成名称。作品价格及许可来自沙箱记录，未照抄概念数字。
- 初轮人物8位，文案版返回图与目录现在7位；第8位已在独立撤权场景撤回，不能伪造恢复来凑满矩阵。第四列/第三列的空余属真实结果。
- Figma P01 的四位明星和六张摄影封面是视觉方向；当前应与P01R缺口稿对照，不应把尚无接口的名单或封面视为“前端少画”。详见[接口报告](API_REPORT.md)。
- 全部功能分拆出更多原有业务入口，保留订单、合同、制作、账号、通知等真实用途；不能为了凑成静态九行把它们删掉。
- 320宽刊头/筛选换行、768宽的居中限宽、滚动条和浏览器焦点/悬停色属于响应式或交互状态。OS状态栏和home indicator不在Flutter网页内伪造。

## 未覆盖

- 本报告不宣称真实明星名单、IP/GPS定位、正式作品封面、实际成片质量、付费服务或生产数据已经可用。
- 静态逐图检查不能代替回退、权限、付款、投稿、撤权和HTTP校验；它们见相应流程证据。真机状态栏、软键盘、屏幕阅读器与系统字号仍需设备验收。
- 本侧未重新审阅所有历史103屏；本轮范围为已确认的新广场与直接子页。其余业务子页由另一份逐图记录承接，不混记为本侧已看。

## 实际打开的图片

下列直接查看文件均通过view_image打开实际像素；历史图若未纳入最终证据包，保留其本机原文件名。当前有效对应图见统一视觉修正版与最终入口文字版；final-copy仅保留较早文案修正的证据。正文的证据链接使用已整理进PR的相同PNG副本。相同SHA-256的重复图片以已打开的同字节内容复核，不用ARIA或运行报告替代图像。

### Figma正式导出

- [P01.png](../../ux/plaza-dense-20261026/figma-evidence/P01.png)
- [P01R.png](../../ux/plaza-dense-20261026/figma-evidence/P01R.png)
- [P02.png](../../ux/plaza-dense-20261026/figma-evidence/P02.png)
- [P03.png](../../ux/plaza-dense-20261026/figma-evidence/P03.png)
- [P04.png](../../ux/plaza-dense-20261026/figma-evidence/P04.png)
- [P05.png](../../ux/plaza-dense-20261026/figma-evidence/P05.png)
- [P06.png](../../ux/plaza-dense-20261026/figma-evidence/P06.png)
- [P07.png](../../ux/plaza-dense-20261026/figma-evidence/P07.png)

### 应用直接查看：84张

| 文件 | 本轮状态 |
| --- | --- |
| [channels-320-artists-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-artists-00.png) | 初轮，修正前 |
| [channels-320-artists-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-artists-01.png) | 初轮，修正前 |
| [channels-320-local-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-local-00.png) | 初轮，修正前 |
| [channels-320-local-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-local-01.png) | 初轮，修正前 |
| [channels-320-selected-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-selected-00.png) | 初轮，修正前 |
| [channels-320-selected-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-selected-01.png) | 初轮，修正前 |
| [channels-320-selected-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-selected-02.png) | 初轮，修正前 |
| [channels-320-works-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-works-00.png) | 初轮，修正前 |
| [channels-320-works-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-works-01.png) | 初轮，修正前 |
| [channels-390-artists-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-artists-00.png) | 初轮，修正前 |
| [channels-390-artists-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-artists-01.png) | 初轮，修正前 |
| [channels-390-local-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-local-00.png) | 初轮，修正前 |
| [channels-390-local-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-local-01.png) | 初轮，修正前 |
| [channels-390-selected-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-selected-00.png) | 初轮，修正前 |
| [channels-390-selected-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-selected-01.png) | 初轮，修正前 |
| [channels-390-selected-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-selected-02.png) | 初轮，修正前 |
| [channels-390-works-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-works-00.png) | 初轮，修正前 |
| [channels-390-works-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-works-01.png) | 初轮，修正前 |
| [channels-768-artists-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-artists-00.png) | 初轮，修正前 |
| [channels-768-artists-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-artists-01.png) | 初轮，修正前 |
| [channels-768-local-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-local-00.png) | 初轮，修正前 |
| [channels-768-selected-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-selected-00.png) | 初轮，修正前 |
| [channels-768-selected-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-selected-01.png) | 初轮，修正前 |
| [channels-768-selected-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-selected-02.png) | 初轮，修正前 |
| [channels-768-works-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-works-00.png) | 初轮，修正前 |
| [channels-768-works-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-works-01.png) | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-320-empty-city-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-320-empty-city-01.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-320-empty-city-02.png`（本机历史原图） | 初轮，修正前 |
| [city-320-final-copy-restored-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-320-final-copy-restored-00.png) | 文案版，后续样式修正前 |
| [city-320-final-copy-selector-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-320-final-copy-selector-00.png) | 文案版，后续样式修正前 |
| `output/playwright/plaza-dense-20261026/city-320-restored-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-320-selector-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-390-empty-city-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-390-empty-city-01.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-390-empty-city-02.png`（本机历史原图） | 初轮，修正前 |
| [city-390-final-copy-restored-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-390-final-copy-restored-00.png) | 文案版，后续样式修正前 |
| [city-390-final-copy-selector-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-390-final-copy-selector-00.png) | 文案版，后续样式修正前 |
| `output/playwright/plaza-dense-20261026/city-390-restored-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-390-selector-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-768-empty-city-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-768-empty-city-01.png`（本机历史原图） | 初轮，修正前 |
| [city-768-final-copy-restored-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-768-final-copy-restored-00.png) | 文案版，后续样式修正前 |
| [city-768-final-copy-selector-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-768-final-copy-selector-00.png) | 文案版，后续样式修正前 |
| `output/playwright/plaza-dense-20261026/city-768-restored-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/city-768-selector-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-320-all-functions-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-320-all-functions-01.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-320-all-functions-02.png`（本机历史原图） | 初轮，修正前 |
| [search-directory-320-final-copy-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-final-copy-all-functions-00.png) | 文案版，后续样式修正前 |
| [search-directory-320-final-copy-directory-artists-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-final-copy-directory-artists-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-320-final-copy-directory-auditions-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-final-copy-directory-auditions-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-320-final-copy-directory-notices-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-final-copy-directory-notices-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-320-final-copy-directory-stock-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-final-copy-directory-stock-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-320-final-copy-directory-stock-purchases-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-final-copy-directory-stock-purchases-00.png) | 文案版，后续样式修正前 |
| [search-directory-320-final-copy-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-final-copy-search-00.png) | 文案版，后续样式修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-320-search-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-320-search-01.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-320-search-artists-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-390-all-functions-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-390-all-functions-01.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-390-all-functions-02.png`（本机历史原图） | 初轮，修正前 |
| [search-directory-390-final-copy-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-all-functions-00.png) | 文案版，后续样式修正前 |
| [search-directory-390-final-copy-directory-artists-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-directory-artists-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-390-final-copy-directory-auditions-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-directory-auditions-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-390-final-copy-directory-notices-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-directory-notices-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-390-final-copy-directory-stock-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-directory-stock-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-390-final-copy-directory-stock-purchases-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-directory-stock-purchases-00.png) | 文案版，后续样式修正前 |
| [search-directory-390-final-copy-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-final-copy-search-00.png) | 文案版，后续样式修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-390-search-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-390-search-artists-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-768-all-functions-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-768-all-functions-01.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-768-all-functions-02.png`（本机历史原图） | 初轮，修正前 |
| [search-directory-768-final-copy-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-all-functions-00.png) | 文案版，后续样式修正前 |
| [search-directory-768-final-copy-directory-artists-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-directory-artists-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-768-final-copy-directory-auditions-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-directory-auditions-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-768-final-copy-directory-notices-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-directory-notices-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-768-final-copy-directory-stock-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-directory-stock-catalog-00.png) | 文案版，后续样式修正前 |
| [search-directory-768-final-copy-directory-stock-purchases-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-directory-stock-purchases-00.png) | 文案版，后续样式修正前 |
| [search-directory-768-final-copy-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-search-00.png) | 文案版，后续样式修正前 |
| [search-directory-768-final-copy-search-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-final-copy-search-01.png) | 文案版，后续样式修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-768-search-00.png`（本机历史原图） | 初轮，修正前 |
| `output/playwright/plaza-dense-20261026/search-directory-768-search-artists-00.png`（本机历史原图） | 初轮，修正前 |

### 同字节图片复核

| 文件 | 与已打开的内容相同 |
| --- | --- |
| `city-320-final-copy-empty-city-00.png` | `city-320-empty-city-00.png` |
| `city-320-final-copy-empty-city-01.png` | `city-320-empty-city-01.png` |
| `city-320-final-copy-empty-city-02.png` | `city-320-empty-city-02.png` |
| `city-390-final-copy-empty-city-00.png` | `city-390-empty-city-00.png` |
| `city-390-final-copy-empty-city-01.png` | `city-390-empty-city-01.png` |
| `city-390-final-copy-empty-city-02.png` | `city-390-empty-city-02.png` |
| `city-768-final-copy-empty-city-00.png` | `city-768-empty-city-00.png` |
| `city-768-final-copy-empty-city-01.png` | `city-768-empty-city-01.png` |
| `search-directory-320-final-copy-all-functions-01.png` | `search-directory-320-all-functions-01.png` |
| `search-directory-320-final-copy-all-functions-02.png` | `search-directory-320-all-functions-02.png` |
| `search-directory-320-final-copy-search-artists-00.png` | `search-directory-320-final-copy-directory-artists-catalog-00.png` |
| `search-directory-320-final-copy-search-notices-00.png` | `search-directory-320-final-copy-directory-notices-catalog-00.png` |
| `search-directory-320-final-copy-search-works-00.png` | `search-directory-320-final-copy-directory-stock-catalog-00.png` |
| `search-directory-390-final-copy-all-functions-01.png` | `search-directory-390-all-functions-01.png` |
| `search-directory-390-final-copy-all-functions-02.png` | `search-directory-390-all-functions-02.png` |
| `search-directory-390-final-copy-search-artists-00.png` | `search-directory-390-final-copy-directory-artists-catalog-00.png` |
| `search-directory-390-final-copy-search-notices-00.png` | `search-directory-390-final-copy-directory-notices-catalog-00.png` |
| `search-directory-390-final-copy-search-works-00.png` | `search-directory-390-final-copy-directory-stock-catalog-00.png` |
| `search-directory-768-final-copy-all-functions-01.png` | `search-directory-768-all-functions-01.png` |
| `search-directory-768-final-copy-all-functions-02.png` | `search-directory-768-all-functions-02.png` |
| `search-directory-768-final-copy-search-artists-00.png` | `search-directory-768-final-copy-directory-artists-catalog-00.png` |
| `search-directory-768-final-copy-search-notices-00.png` | `search-directory-768-final-copy-directory-notices-catalog-00.png` |
| `search-directory-768-final-copy-search-works-00.png` | `search-directory-768-final-copy-directory-stock-catalog-00.png` |

### 统一视觉修正版：直接查看67张

以下各图逐个打开实际像素。频道26张、城市14张、搜索及全部功能27张；后者还覆盖通向艺人、作品、通告、试镜、已购目录的目的页。b95图中的固定“公开”标签属于VH07的修前证据，后续文字版另列。

| 文件 | 版本 |
| --- | --- |
| [channels-320-visual-final-artists-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-artists-00.png) | b95视觉修正版 |
| [channels-320-visual-final-artists-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-artists-01.png) | b95视觉修正版 |
| [channels-320-visual-final-local-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-local-00.png) | b95视觉修正版 |
| [channels-320-visual-final-local-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-local-01.png) | b95视觉修正版 |
| [channels-320-visual-final-selected-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-selected-00.png) | b95视觉修正版 |
| [channels-320-visual-final-selected-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-selected-01.png) | b95视觉修正版 |
| [channels-320-visual-final-selected-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-selected-02.png) | b95视觉修正版 |
| [channels-320-visual-final-works-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-works-00.png) | b95视觉修正版 |
| [channels-320-visual-final-works-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-320-visual-final-works-01.png) | b95视觉修正版 |
| [channels-390-visual-final-artists-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-artists-00.png) | b95视觉修正版 |
| [channels-390-visual-final-artists-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-artists-01.png) | b95视觉修正版 |
| [channels-390-visual-final-local-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-local-00.png) | b95视觉修正版 |
| [channels-390-visual-final-local-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-local-01.png) | b95视觉修正版 |
| [channels-390-visual-final-selected-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-selected-00.png) | b95视觉修正版 |
| [channels-390-visual-final-selected-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-selected-01.png) | b95视觉修正版 |
| [channels-390-visual-final-selected-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-selected-02.png) | b95视觉修正版 |
| [channels-390-visual-final-works-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-works-00.png) | b95视觉修正版 |
| [channels-390-visual-final-works-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-390-visual-final-works-01.png) | b95视觉修正版 |
| [channels-768-visual-final-artists-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-artists-00.png) | b95视觉修正版 |
| [channels-768-visual-final-artists-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-artists-01.png) | b95视觉修正版 |
| [channels-768-visual-final-local-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-local-00.png) | b95视觉修正版 |
| [channels-768-visual-final-selected-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-selected-00.png) | b95视觉修正版 |
| [channels-768-visual-final-selected-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-selected-01.png) | b95视觉修正版 |
| [channels-768-visual-final-selected-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-selected-02.png) | b95视觉修正版 |
| [channels-768-visual-final-works-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-works-00.png) | b95视觉修正版 |
| [channels-768-visual-final-works-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/channels-768-visual-final-works-01.png) | b95视觉修正版 |
| [city-320-visual-final-empty-city-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-320-visual-final-empty-city-00.png) | b95视觉修正版 |
| [city-320-visual-final-empty-city-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-320-visual-final-empty-city-01.png) | b95视觉修正版 |
| [city-320-visual-final-restored-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-320-visual-final-restored-00.png) | b95视觉修正版 |
| [city-320-visual-final-selector-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-320-visual-final-selector-00.png) | b95视觉修正版 |
| [city-320-visual-final-selector-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-320-visual-final-selector-01.png) | b95视觉修正版 |
| [city-390-visual-final-empty-city-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-390-visual-final-empty-city-00.png) | b95视觉修正版 |
| [city-390-visual-final-empty-city-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-390-visual-final-empty-city-01.png) | b95视觉修正版 |
| [city-390-visual-final-empty-city-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-390-visual-final-empty-city-02.png) | b95视觉修正版 |
| [city-390-visual-final-restored-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-390-visual-final-restored-00.png) | b95视觉修正版 |
| [city-390-visual-final-selector-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-390-visual-final-selector-00.png) | b95视觉修正版 |
| [city-768-visual-final-empty-city-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-768-visual-final-empty-city-00.png) | b95视觉修正版 |
| [city-768-visual-final-empty-city-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-768-visual-final-empty-city-01.png) | b95视觉修正版 |
| [city-768-visual-final-restored-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-768-visual-final-restored-00.png) | b95视觉修正版 |
| [city-768-visual-final-selector-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/city-768-visual-final-selector-00.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-all-functions-00.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-all-functions-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-all-functions-01.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-all-functions-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-all-functions-02.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-directory-artists-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-directory-artists-catalog-00.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-directory-auditions-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-directory-auditions-catalog-00.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-directory-notices-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-directory-notices-catalog-00.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-directory-stock-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-directory-stock-catalog-00.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-directory-stock-purchases-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-directory-stock-purchases-00.png) | b95视觉修正版 |
| [search-directory-320-visual-final-recheck-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-final-recheck-search-00.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-all-functions-00.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-all-functions-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-all-functions-01.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-all-functions-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-all-functions-02.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-directory-artists-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-directory-artists-catalog-00.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-directory-auditions-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-directory-auditions-catalog-00.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-directory-notices-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-directory-notices-catalog-00.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-directory-stock-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-directory-stock-catalog-00.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-directory-stock-purchases-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-directory-stock-purchases-00.png) | b95视觉修正版 |
| [search-directory-390-visual-final-recheck-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-final-recheck-search-00.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-all-functions-00.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-all-functions-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-all-functions-01.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-all-functions-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-all-functions-02.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-directory-artists-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-directory-artists-catalog-00.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-directory-auditions-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-directory-auditions-catalog-00.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-directory-notices-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-directory-notices-catalog-00.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-directory-stock-catalog-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-directory-stock-catalog-00.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-directory-stock-purchases-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-directory-stock-purchases-00.png) | b95视觉修正版 |
| [search-directory-768-visual-final-recheck-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-final-recheck-search-00.png) | b95视觉修正版 |

### 统一视觉修正版：同字节目的页9张

下列SHA-256分别与右列已打开图片相同；搜索和全部功能均实际走了各自导航流程，共用真实目录没有增加第二种画面。

| 文件 | 与已打开的内容相同 |
| --- | --- |
| `search-directory-320-visual-final-recheck-search-artists-00.png` | `search-directory-320-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-320-visual-final-recheck-search-notices-00.png` | `search-directory-320-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-320-visual-final-recheck-search-works-00.png` | `search-directory-320-visual-final-recheck-directory-stock-catalog-00.png` |
| `search-directory-390-visual-final-recheck-search-artists-00.png` | `search-directory-390-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-390-visual-final-recheck-search-notices-00.png` | `search-directory-390-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-390-visual-final-recheck-search-works-00.png` | `search-directory-390-visual-final-recheck-directory-stock-catalog-00.png` |
| `search-directory-768-visual-final-recheck-search-artists-00.png` | `search-directory-768-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-768-visual-final-recheck-search-notices-00.png` | `search-directory-768-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-768-visual-final-recheck-search-works-00.png` | `search-directory-768-visual-final-recheck-directory-stock-catalog-00.png` |

### 最终入口文字版：直接查看12张

三宽搜索首屏、全部功能上段与末段均实际打开；私有订单、草稿等行也使用“入口”。未见文字修正导致的溢出或遮挡。

| 文件 |
| --- |
| [search-directory-320-visual-entry-final-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-entry-final-all-functions-00.png) |
| [search-directory-320-visual-entry-final-all-functions-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-entry-final-all-functions-01.png) |
| [search-directory-320-visual-entry-final-all-functions-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-entry-final-all-functions-02.png) |
| [search-directory-320-visual-entry-final-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-320-visual-entry-final-search-00.png) |
| [search-directory-390-visual-entry-final-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-entry-final-all-functions-00.png) |
| [search-directory-390-visual-entry-final-all-functions-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-entry-final-all-functions-01.png) |
| [search-directory-390-visual-entry-final-all-functions-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-entry-final-all-functions-02.png) |
| [search-directory-390-visual-entry-final-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-390-visual-entry-final-search-00.png) |
| [search-directory-768-visual-entry-final-all-functions-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-entry-final-all-functions-00.png) |
| [search-directory-768-visual-entry-final-all-functions-01.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-entry-final-all-functions-01.png) |
| [search-directory-768-visual-entry-final-all-functions-02.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-entry-final-all-functions-02.png) |
| [search-directory-768-visual-entry-final-search-00.png](../../testing/plaza-dense-20261026/api/browser-evidence/search-directory-768-visual-entry-final-search-00.png) |

### 最终入口文字版：同字节目的页24张

以下每张与右列此前已直接打开的PNG进行SHA-256比对，全部相同；仅对新标签页作直接复验，没有把未变的业务画面重复算为新检查。

| 文件 | 与已直接打开的内容相同 |
| --- | --- |
| `search-directory-320-visual-entry-final-directory-artists-catalog-00.png` | `search-directory-320-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-320-visual-entry-final-directory-auditions-catalog-00.png` | `search-directory-320-visual-final-recheck-directory-auditions-catalog-00.png` |
| `search-directory-320-visual-entry-final-directory-notices-catalog-00.png` | `search-directory-320-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-320-visual-entry-final-directory-stock-catalog-00.png` | `search-directory-320-visual-final-recheck-directory-stock-catalog-00.png` |
| `search-directory-320-visual-entry-final-directory-stock-purchases-00.png` | `search-directory-320-visual-final-recheck-directory-stock-purchases-00.png` |
| `search-directory-320-visual-entry-final-search-artists-00.png` | `search-directory-320-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-320-visual-entry-final-search-notices-00.png` | `search-directory-320-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-320-visual-entry-final-search-works-00.png` | `search-directory-320-visual-final-recheck-directory-stock-catalog-00.png` |
| `search-directory-390-visual-entry-final-directory-artists-catalog-00.png` | `search-directory-390-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-390-visual-entry-final-directory-auditions-catalog-00.png` | `search-directory-390-visual-final-recheck-directory-auditions-catalog-00.png` |
| `search-directory-390-visual-entry-final-directory-notices-catalog-00.png` | `search-directory-390-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-390-visual-entry-final-directory-stock-catalog-00.png` | `search-directory-390-visual-final-recheck-directory-stock-catalog-00.png` |
| `search-directory-390-visual-entry-final-directory-stock-purchases-00.png` | `search-directory-390-visual-final-recheck-directory-stock-purchases-00.png` |
| `search-directory-390-visual-entry-final-search-artists-00.png` | `search-directory-390-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-390-visual-entry-final-search-notices-00.png` | `search-directory-390-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-390-visual-entry-final-search-works-00.png` | `search-directory-390-visual-final-recheck-directory-stock-catalog-00.png` |
| `search-directory-768-visual-entry-final-directory-artists-catalog-00.png` | `search-directory-768-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-768-visual-entry-final-directory-auditions-catalog-00.png` | `search-directory-768-visual-final-recheck-directory-auditions-catalog-00.png` |
| `search-directory-768-visual-entry-final-directory-notices-catalog-00.png` | `search-directory-768-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-768-visual-entry-final-directory-stock-catalog-00.png` | `search-directory-768-visual-final-recheck-directory-stock-catalog-00.png` |
| `search-directory-768-visual-entry-final-directory-stock-purchases-00.png` | `search-directory-768-visual-final-recheck-directory-stock-purchases-00.png` |
| `search-directory-768-visual-entry-final-search-artists-00.png` | `search-directory-768-visual-final-recheck-directory-artists-catalog-00.png` |
| `search-directory-768-visual-entry-final-search-notices-00.png` | `search-directory-768-visual-final-recheck-directory-notices-catalog-00.png` |
| `search-directory-768-visual-entry-final-search-works-00.png` | `search-directory-768-visual-final-recheck-directory-stock-catalog-00.png` |
