# 广场二级页逐图审阅

2026-10-27。本报告先记录实际截图发现，再记录修正和复核，保留修前证据。当前已逐张打开203张应用PNG及13张正式Figma导出，其中97张为最终冻结构建的新图；另4张经SHA-256核实与已看图完全相同，单列复用关系且不计入逐张打开数量。未用ARIA文字代替看图。

**当前结论：本轮发现的6类前端问题已修代码，84项针对检查通过；涉及筛选、艺人详情、作品许可、三类投稿及S05/S06的修正均完成320/390/768三宽实拍复核，未见新增视觉阻断。修前图不能作为修后通过证据。** 其他已观察到的差异、素材与接口边界见下表，不宣称所有页面逐像素一致。

## 依据和范围

- 设计为原Figma文件 `4W24XKo6ODW5JD8lBAyuDj`，正式板 `2169:2`，本次实际读取的是仓库内P08—P18、S05、S06导出。导出已校准Noto Serif SC Black，主按钮为深朱红 `#A73124`，亮朱红用于点缀。
- 修前应用来自 `output/playwright/plaza-dense-20261026/` 的非preflight图。优先采用320/768的completion补拍、390的form-input实填、writes2确认及原记录；每个确切文件列在末尾。
- 这些是本机隔离沙箱中的合成身份、人物占位、色条作品和合成通告。业务读取及本次许可购买/投稿调用实际HTTP；测试入口只负责合成身份启动。图中价格、期限、状态和英文条款来自当次沙箱返回，不能当成正式商品或真实合作事实。
- 修前截图所属测试包 `main.dart.js` SHA-256 为 `abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03`。普通 `main.dart` 构建与接口/截图包分别验收；本报告没有把测试身份入口当成正式登录验收。

## 实际发现与修正

| 问题 | 看图发现 | 本轮处理 | 当前验证状态 |
| --- | --- | --- | --- |
| 艺人详情沿用过大的旧构图 | [390修前图](evidence/before-artist-detail-390.png)中姓名仍为64px级巨字，6字示例分成三大行；肖像槽高320。与[P09](../../ux/plaza-dense-20261026/figma-evidence/P09.png)的32px姓名、228高肖像不同。320和768图同样可见。 | 公开详情局部改为32px Black、228高肖像；初入复用公开素材逐次核权读取。无可显示图片时用诚实占位，不用设计示例替代真实艺人。关于艺人、作品与声音栏目用24px层级。 | 最终三宽实拍已见32/228紧凑构图，长合成姓名换行完整；几何断言通过。 |
| 详情试镜入口不存在 | [修前入口结果](evidence/before-artist-auditions-404.png)在320/390/768均实际显示“页面不存在”。原按钮使用未映射的 `/auditions`。 | 按钮改为 `/auditions/catalog?city=当前真实城市`；根代理另给旧 `/auditions` 增加兼容映射。不新造艺人ID过滤，也不把公开展示当成档期承诺。 | 最终三宽实际显示试镜目录、郑州条件和已审核方案，旧404已消除；命名路由及城市参数断言通过。 |
| 主按钮视觉高度不符 | 多张修前图中按钮色块约36px；虽声明最小44，桌面默认视觉密度会压缩绘制尺寸。 | 仅plaza主题使用 `VisualDensity.standard`，其他原有页面保留默认。 | 新测试量取按钮内部Material表面为44px，最终P08/P09/P10及三类投稿的三宽实拍色块及间距相符。 |
| 许可和筛选勾选框方向不符 | [作品修前图](evidence/before-stock-license-390.png)中框在文字右侧，而P08/P10/S06稿为左侧。 | 本轮筛选、作品许可及报价重核复选框采用leading。 | 最终P08/P10/S06三宽实拍均见左侧勾选，选中/清空/禁用状态区分清楚。 |
| 作品预览操作顺序不符 | 修前P10把红色读取按钮放在片名前；[设计](../../ux/plaza-dense-20261026/figma-evidence/P10.png)为媒体槽、片名/介绍、细框读取。 | 媒体组件增加默认关闭的细框选项和默认空的说明插槽；本页按稿编排。播放后仍可暂停和重新核权读取，其他既有媒体调用保持原结构。 | 最终三宽实拍已见媒体槽—标题/说明—细框读取顺序；获准色条预览、暂停和重新读取均可见。 |
| 表单下拉与完整授权核对不足 | [320角色修前图](evidence/before-role-form-320.png)中下拉为白底、较粗大字，选中授权被省略，无法在当前控件里完整核对。390也存在，768可容纳较短示例。 | plaza字段改纸色、14px Sans普通字重；仅授权候选启用两行摘要、换行菜单及“查看完整选中内容”。本人授权同时呈现已有用途、有效期、接收通告；机构仍只能看原安全上下文，不读取本人私有同意。引用ID与提交门禁未改变。 | 最终三类表单三宽实拍已见纸色14px字段、授权摘要及完整展开；320有效期、用途和接收通告可换行核对。长字段和无额外POST测试通过。 |

上述修正是看图后实施，相关原截图作为问题证据保留。84项针对检查包含公开详情、路由、授权展开、实际按钮高度、三列/两列布局、许可重核、失权清理和原表单处理；没有因视觉改动放松验证或修改API。

## 已从图片确认的实现与边界

| 页面/状态 | 已实际看见 | 与设计、数据的差异或限制 |
| --- | --- | --- |
| P08艺人筛选 | 正式稿及最终三宽初入、选中、重置、结果图均已看。城市/标签纸色直框、左勾选、无档期承诺文案和44px主动作可见；选中配音及试镜展示后，结果页保留相应条件。 | 最终补齐独立P08实拍。320长说明自动换行，768内容居中；没有横向截断或五项底栏。 |
| P09艺人详情 | 最终三宽姓名、城市、介绍、认证、获准预览、保存及返回均能阅读；32/228紧凑构图和24px分节可见，二级页没有五项底栏。公开试镜入口实际到达带郑州条件的既有试镜目录。 | 应用素材是经当前沙箱返回的人形占位，不是Figma概念肖像；正式肖像仍需真实获准素材。目标试镜目录保留先前已校准的业务版式。 |
| P10作品详情 | 三宽24px级作品标题、个人非商用/非独家/全球/永久范围、排除条款、真实核对时限、售后长文和许可勾选均可滚动查看；未勾选时购买动作禁用。 | 示范图没有把价格写死；应用显示沙箱实际¥1.00和72小时。英文售后条款是原返回内容，未为视觉任务改写。封面字段仍缺，不能用Figma剧照冒充商品封面。 |
| P11获准预览 | 320/390/768中实际色条视频可显示，暂停和重新读取动作可见。 | 证明播放器/权限链可读取合成预览，不证明真实影片质量、水印、数字人效果或完整商业许可。 |
| P12购买确认/原订单 | 对话框显示本版价格及完整个人许可。之后原订单明确“待付款”，已核实收款为0，未显示付款或许可已生效。长订单页可滚动到合同、付款、售后和原记录。 | 对话框保留现有“返回核对/确认办理”，与稿“取消/确认并查看原订单”存在文案差异；当前标题明确是按本版许可购买。原订单是既有私有业务页，未随本轮重新设计。 |
| P13六类通告 | 从失败恢复后的图看到七个筛选项（全部加六类）、六种真实类别短列表及投稿/已发/客服入口；没有首条巨幅空封面。 | 390自然换行较稿多一行；所有类别仍可见、可操作，未出现横向截断。城市及截止时间是沙箱数据。 |
| P14通告详情 | 招募详情三宽标题、类型、城市、要求、开始/截止及三种投稿入口完整，无五项底栏。另实际补看剧与角色、商演、商单、活动、平台官方详情，专属字段均可读；剧与角色/招募有三投稿，其他四类没有凭空出现投稿或购买动作。 | 六类详情补查图为早批证据，其按钮仍是修前密度；新版三宽样式见最终招募详情，不用早批图证明44px。按实际通告内容增长，不能将稿中占位时间当成业务默认值。 |
| P15/P16/P17三类投稿 | 最终三宽实填长页均看见真人选择、授权摘要/完整展开、用途、内容和私有材料入口；ROLE额外有明确角色字段及6/500计数，其余两类没有混入角色字段。均可滚动到44px提交区域。 | 重拍因控件名称与原生输入焦点变化使用recheck/form320后缀；最终图已显示输入内容和计数。未在这轮新图提交投稿或实传私有附件；原HTTP投稿闭环见前批证据。 |
| 缺本次接收方同意 | 明确显示办理本人同意，没有授权候选、用途正文和提交表单。 | 没有用手填内部编号或私有数据绕过。机构首次受托引用等缺口仍见API报告。 |
| P18原投稿结果 | 三类本次新建记录及重读均显示原状态；另看见待审、已送达、感兴趣等待客服三种已有状态。ROLE保留实际角色，其余无虚构角色。 | 没有把感兴趣画成成交、付款、签约、授角或自由聊天。未代同事审阅或产品确认。 |
| S05资料不可用 | 修前真实撤权结果图已实际不含旧姓名、介绍和照片，提供返回目录动作。最终三宽新版图显示170高文档空态、24px不可用标题及44px返回动作，未残留旧信息。 | 修前初次自动检查等待heading角色超时，但图中已显示不可用正文；不据此称撤权失败。新版构图每宽先真实PNG200、单次受控GET409、随后真实GET仍200，0写入，未再次撤回后端授权。 |
| S06报价更新 | 最终三宽均实际显示“重新确认本版许可”，旧作品/价格清除、已读框取消并禁用、购买禁用；真实GET重读后恢复作品与许可，已读仍为空。 | 每宽为一次明确标注的浏览器受控412，checkout POST未到后端。随后GET为真实读取；没有真实修改后端报价，也不把该故障注入称为后端自然改价。 |
| 读取失败/恢复/404 | 三个目录故障图无业务成功空态；恢复图分别展示艺人、作品和通告。真实404图不暴露原记录内容。 | 故障注入与实际HTTP恢复区分；没有把模拟断网当成后端自然故障，也没从404推定退款或本人撤回。 |

## 仍未覆盖

浏览器放大字体/真机字体缩放、真实私有附件上传、正式短信/支付/签署、付款后许可生效、真实人物/作品素材和同事审阅均不能由本报告代验。320/390/768是本批实际浏览器宽度；1.6倍字体仅有针对widget布局检查。

明星名单、IP/设备城市来源、城市值归一、正式作品封面/缩略图、首次受托授权上下文等接口事项见[接口核对报告](API_REPORT.md)。本报告不把这些缺口混作已完成视觉或正式服务验收。

## 修后复核

最终截图包 `main.dart.js` SHA-256：`b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c`。以下97张新图均已逐张打开，仍为合成身份启动、真实HTTP业务读取；S05/S06例外的受控409/412见下列边界。

| 修后页面 | 实际复核结论 | PR中可直接查看的代表图 |
| --- | --- | --- |
| P08：三宽初入/选中/重置/结果，共14张 | 24px衬线标题、14px字段、纸色细框、左侧勾选、深红44px主动作；320说明折行可读，768居中。结果目录与所选城市/标签/试镜展示一致。 | [390筛选](evidence/after-artist-filters-390.png) |
| P09：三宽初入/获准读取/试镜入口，共14张 | 姓名改为32px、肖像228高，信息和预览操作完整；长合成姓名换行未被截断。三宽入口实际到达试镜目录并显示郑州，不再404，不承诺个人档期。 | [390详情](evidence/after-artist-detail-390.png)、[实际试镜目录](evidence/after-artist-auditions-390.png) |
| P10/P11：三宽详情长文、已读及获准预览，共16张 | 媒体槽、片名介绍和细框读取顺序已对齐；许可左勾选，未读时禁用购买，读后深红主动作。私有合成色条、暂停及再次读取可见。长许可/排除/英文售后不截断，二级页无底栏。覆盖核对补看390/768已读02图，勾选、价格和购买/重读动作仍完整。 | [片名与细框读取](evidence/after-stock-detail-390.png)、[许可与左框](evidence/after-stock-license-390.png) |
| P12：三宽确认弹窗，共9张 | 价格、个人许可、允许/排除及完整条款可读；320动作自然竖排，390/768横排，按钮未被遮挡。本轮只打开后取消，没有提交checkout。保留原“返回核对/确认办理”文案差异。 | [390购买核对](evidence/after-stock-confirm-390.png) |
| S06：三宽受控412及真实重读，共11张 | 412后旧作品/价格不再显示，已读取消、不可继续购买；真实GET重读后仍须重新勾选。仅证明异常恢复的前端表现，未制造真实改价或订单。 | [受控412状态](evidence/after-stock-s06-390.png)、[真实重读后仍未勾选](evidence/after-stock-s06-reread-390.png) |
| P14/P15/P16/P17：三宽通告详情与三类实填表单，共30张 | 字段纸色14px普通字重、24px标题，完整授权可展开核对用途/有效期/接收方；320长值换行完整。ROLE独有角色字段，其余未出现角色项；私有材料及底部44px提交可滚动到。 | [320完整授权](evidence/after-notice-consent-320.png)、[320角色字段与提交](evidence/after-notice-role-320.png) |
| S05：三宽不可用空态，共3张 | 170高文档空态、24px标题、44px返回动作完整；无旧姓名、介绍、肖像或预览保存动作。每宽为真实PNG200后的单次受控GET409，随后真实GET仍200，0写入；只验新版布局，与前批真实撤权链分开。 | [390新版不可用](evidence/after-artist-s05-390.png) |

上述受修正影响页面及状态的末轮补拍均已完成并实际看图，修前发现和证据继续保留。

## 覆盖清单末轮补查

总覆盖映射核对后，补看8张归档原图：最终已读状态2张、早批六类详情补图6张。390/768的已读02图中，真实价格、许可长文、左侧选中框、44px购买及重读均完整。六类详情按真实类别显示字段：剧与角色有剧情/项目简介及招募角色；商演有正规场地、安排及参与要求；商单有交付内容及合作要求；活动有场地及安排；官方有官方事项和官方身份说明。只有剧与角色及招募显示三种投稿，其他四类保留读取操作，没有新增业务规则。未发现新增内容截断或动作遮挡。

下列4张按SHA-256逐对核实为同字节，复用已实际查看的对应图，不重复计数：

| 覆盖映射文件 | 已实际查看的相同原图 | SHA-256 |
| --- | --- | --- |
| `stock-detail-320-visual-final-license-acknowledged-00.png` | `stock-detail-320-visual-final-preview-00.png` | `c17916292a137df8f7372b2e4adbaa227344d23c9fbb97b1fc8fa93053ebf6d1` |
| `stock-detail-390-visual-final-license-acknowledged-00.png` | `stock-detail-390-visual-final-preview-00.png` | `0a0b8e16a109fa86a10b64cc1fba9bae00232bab3a2fbe3ece768824c3746b98` |
| `stock-detail-768-visual-final-license-acknowledged-00.png` | `stock-detail-768-visual-final-preview-00.png` | `8467917588370ce44ebae3bda4d445da4bc1a69dc2450be638b78a299a9dcbf2` |
| `notice-types-results-390-type-recruitment-00.png` | `notice-forms-390-form-input-notice-detail-00.png` | `b97b0ad53ecc9806dc87aa41f483cb7574b331875984d2507040e350a8423151` |

映射文件位于 `docs/testing/plaza-dense-20261026/api/browser-evidence/`；相同原图已在下列逐图清单按原位置列出。

## 本次实际打开的图片

以下为确切文件定位。`output/`中的完整原始批次位于工作树本地；PR内另外保存了4张关键修前问题图，避免仅有不可访问的本机路径。

- `docs/ux/plaza-dense-20261026/figma-evidence/P09.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/S05.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-authorized-preview-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-authorized-preview-01.png`
- `output/playwright/plaza-dense-20261026/artist-revocation-390-writes2-before-revocation-00.png`
- `output/playwright/plaza-dense-20261026/artist-revocation-390-failure.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P10.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P11.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P12.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/S06.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-license-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-license-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-license-02.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-preview-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-authorized-preview-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-authorized-preview-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-authorized-preview-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-auditions-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-auditions-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-auditions-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-license-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-license-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-license-02.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-preview-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-license-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-license-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-preview-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-notice-detail-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-form-profile-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-form-profile-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-form-role-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-form-role-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-form-role-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-form-create_drama-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-form-input-form-create_drama-01.png`
- `output/playwright/plaza-dense-20261026/submission-no-consent-390-missing-recipient-consent-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-notice-detail-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-notice-detail-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-profile-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-profile-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-profile-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-role-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-role-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-role-02.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P08.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P13.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P14.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P15.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P16.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P17.png`
- `docs/ux/plaza-dense-20261026/figma-evidence/P18.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-create_drama-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-create_drama-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-completion-form-create_drama-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-completion-notice-detail-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-completion-form-profile-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-completion-form-profile-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-completion-form-role-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-completion-form-role-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-completion-form-create_drama-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-completion-form-create_drama-01.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-confirmation-00.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-confirmation-01.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-confirmation-02.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-original-order-00.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-original-order-01.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-original-order-02.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-original-order-03.png`
- `output/playwright/plaza-dense-20261026/checkout-390-writes2-original-order-04.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-artists-controlled-transport-failure-00.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-artists-actual-http-recovery-00.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-artists-actual-http-recovery-01.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-stock-controlled-transport-failure-00.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-stock-actual-http-recovery-00.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-stock-actual-http-recovery-01.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-notices-controlled-transport-failure-00.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-notices-actual-http-recovery-00.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-notices-actual-http-recovery-01.png`
- `output/playwright/plaza-dense-20261026/network-recovery-390-completion-notices-actual-http-recovery-02.png`
- `output/playwright/plaza-dense-20261026/missing-record-390-actual-404-00.png`
- `output/playwright/plaza-dense-20261026/submit-profile-390-writes2-confirmation-00.png`
- `output/playwright/plaza-dense-20261026/submit-profile-390-writes2-confirmation-01.png`
- `output/playwright/plaza-dense-20261026/submit-profile-390-writes2-confirmation-02.png`
- `output/playwright/plaza-dense-20261026/submit-profile-390-writes2-original-submission-00.png`
- `output/playwright/plaza-dense-20261026/submit-profile-390-writes2-original-submission-01.png`
- `output/playwright/plaza-dense-20261026/submit-profile-390-writes2-reread-original-00.png`
- `output/playwright/plaza-dense-20261026/submit-profile-390-writes2-reread-original-01.png`
- `output/playwright/plaza-dense-20261026/submit-role-390-writes2-confirmation-00.png`
- `output/playwright/plaza-dense-20261026/submit-role-390-writes2-confirmation-01.png`
- `output/playwright/plaza-dense-20261026/submit-role-390-writes2-confirmation-02.png`
- `output/playwright/plaza-dense-20261026/submit-role-390-writes2-original-submission-00.png`
- `output/playwright/plaza-dense-20261026/submit-role-390-writes2-original-submission-01.png`
- `output/playwright/plaza-dense-20261026/submit-role-390-writes2-reread-original-00.png`
- `output/playwright/plaza-dense-20261026/submit-role-390-writes2-reread-original-01.png`
- `output/playwright/plaza-dense-20261026/submit-create_drama-390-writes2-confirmation-00.png`
- `output/playwright/plaza-dense-20261026/submit-create_drama-390-writes2-confirmation-01.png`
- `output/playwright/plaza-dense-20261026/submit-create_drama-390-writes2-confirmation-02.png`
- `output/playwright/plaza-dense-20261026/submit-create_drama-390-writes2-original-submission-00.png`
- `output/playwright/plaza-dense-20261026/submit-create_drama-390-writes2-original-submission-01.png`
- `output/playwright/plaza-dense-20261026/submit-create_drama-390-writes2-reread-original-00.png`
- `output/playwright/plaza-dense-20261026/submit-create_drama-390-writes2-reread-original-01.png`
- `output/playwright/plaza-dense-20261026/notice-types-results-390-original-pending-00.png`
- `output/playwright/plaza-dense-20261026/notice-types-results-390-original-pending-01.png`
- `output/playwright/plaza-dense-20261026/notice-types-results-390-original-sent-00.png`
- `output/playwright/plaza-dense-20261026/notice-types-results-390-original-sent-01.png`
- `output/playwright/plaza-dense-20261026/notice-types-results-390-original-interested-00.png`
- `output/playwright/plaza-dense-20261026/notice-types-results-390-original-interested-01.png`

### 最终构建已实际打开的补图

- `output/playwright/plaza-dense-20261026/artist-filters-320-visual-final-filter-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-320-visual-final-filter-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-filters-390-visual-final-filter-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-390-visual-final-filter-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-filters-768-visual-final-filter-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-320-visual-final-filter-selected-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-320-visual-final-filter-reset-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-320-visual-final-filter-results-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-390-visual-final-filter-selected-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-390-visual-final-filter-reset-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-390-visual-final-filter-results-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-768-visual-final-filter-selected-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-768-visual-final-filter-reset-00.png`
- `output/playwright/plaza-dense-20261026/artist-filters-768-visual-final-filter-results-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-license-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-license-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-license-02.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-license-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-license-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-license-02.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-visual-final-license-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-visual-final-license-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-preview-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-license-acknowledged-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-preview-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-license-acknowledged-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-visual-final-preview-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-visual-final-license-acknowledged-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-purchase-review-no-submit-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-purchase-review-no-submit-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-320-visual-final-purchase-review-no-submit-02.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-purchase-review-no-submit-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-purchase-review-no-submit-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-390-visual-final-purchase-review-no-submit-02.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-visual-final-purchase-review-no-submit-00.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-visual-final-purchase-review-no-submit-01.png`
- `output/playwright/plaza-dense-20261026/stock-detail-768-visual-final-purchase-review-no-submit-02.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-320-visual-final-s06-controlled-412-00.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-320-visual-final-s06-real-reread-00.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-320-visual-final-s06-real-reread-01.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-320-visual-final-s06-real-reread-02.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-390-visual-final-s06-controlled-412-00.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-390-visual-final-s06-real-reread-00.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-390-visual-final-s06-real-reread-01.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-390-visual-final-s06-real-reread-02.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-768-visual-final-s06-controlled-412-00.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-768-visual-final-s06-real-reread-00.png`
- `output/playwright/plaza-dense-20261026/stock-quote-change-768-visual-final-s06-real-reread-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-visual-final-recheck-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-visual-final-recheck-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-visual-final-recheck-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-visual-final-recheck-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-visual-final-recheck-initial-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-visual-final-recheck-initial-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-visual-final-recheck-authorized-preview-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-visual-final-recheck-authorized-preview-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-320-visual-final-recheck-auditions-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-visual-final-recheck-authorized-preview-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-visual-final-recheck-authorized-preview-01.png`
- `output/playwright/plaza-dense-20261026/artist-detail-390-visual-final-recheck-auditions-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-visual-final-recheck-authorized-preview-00.png`
- `output/playwright/plaza-dense-20261026/artist-detail-768-visual-final-recheck-auditions-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-notice-detail-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-notice-detail-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-profile-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-profile-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-profile-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-notice-detail-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-form-profile-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-form-profile-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-role-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-role-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-role-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-create_drama-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-create_drama-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-390-visual-final-recheck-form-create_drama-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-form-role-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-form-role-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-form-role-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-form-create_drama-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-768-visual-final-recheck-form-create_drama-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-profile-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-profile-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-profile-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-role-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-role-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-role-02.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-notice-detail-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-notice-detail-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-create_drama-00.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-create_drama-01.png`
- `output/playwright/plaza-dense-20261026/notice-forms-320-visual-final-form320-form-create_drama-02.png`
- `output/playwright/plaza-dense-20261026/artist-unavailable-320-visual-final-s05-s05-controlled-409-00.png`
- `output/playwright/plaza-dense-20261026/artist-unavailable-390-visual-final-s05-s05-controlled-409-00.png`
- `output/playwright/plaza-dense-20261026/artist-unavailable-768-visual-final-s05-s05-controlled-409-00.png`

### 覆盖核对额外实际打开的8张归档图

- `docs/testing/plaza-dense-20261026/api/browser-evidence/stock-detail-390-visual-final-license-acknowledged-02.png`
- `docs/testing/plaza-dense-20261026/api/browser-evidence/stock-detail-768-visual-final-license-acknowledged-02.png`
- `docs/testing/plaza-dense-20261026/api/browser-evidence/notice-types-results-390-type-drama-00.png`
- `docs/testing/plaza-dense-20261026/api/browser-evidence/notice-types-results-390-type-drama-01.png`
- `docs/testing/plaza-dense-20261026/api/browser-evidence/notice-types-results-390-type-performance-00.png`
- `docs/testing/plaza-dense-20261026/api/browser-evidence/notice-types-results-390-type-commercial-00.png`
- `docs/testing/plaza-dense-20261026/api/browser-evidence/notice-types-results-390-type-event-00.png`
- `docs/testing/plaza-dense-20261026/api/browser-evidence/notice-types-results-390-type-official-00.png`
