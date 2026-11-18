# W22 参演/收入约定本页草稿与明确确认绑定

## 源码范围
只改 `lib/projects/participation_pages.dart` 的 `_ProjectAgreementState`。没有改接口、后端、公共请求机制或原管理网页；未提交推送。

## 实际问题与处理
原“已核对本次所有金额、用途、分成和证明”勾选后，多数文本、候选、报酬方式、用途、排他、证据、分期或分成的修改没有撤销旧勾选；提交仍读取当前草稿。这是源码可见的确认绑定缺口，非运行复现。

- 本页重载field，以controller.text实际改变撤销agreed；光标/选择/composing同文本不触发。覆盖金额、理由、地域语言、用途、退款条款、人物造型声音，以及动态创建的分期金额/条件、分成比例输入。
- 非controller值由draftChanged包裹，比对原始草稿签名；覆盖候选选择、mode/usage/exclusive、里程碑、证据、受益方/角色、分期起付选择、分期/分成增删。签名仅读当前原字符串和值，不调用业务校验或接口。
- draftChanged内部的controller变化不嵌套触发setState，统一在回调末撤销。build没有setState，也没有按渲染结果写草稿。
- 重新读取当前记录时撤销旧同意，避免已勾选确认跨版本沿用；原日期回调和412撤销继续保留。
- 未触碰act/reconcilePending/recovered/请求body或原pending。结果未知恢复仍按原body/version/key，不由新勾选或新草稿替换。

## 保留的边界
付费参演所需商业分佣规则合法目录仍未在本次范围证实，原canRule提示保留，不猜规则ID。Web BusinessView原先仅建房监听草稿改变；同一集中批次已将普通操作draft变化撤销确认，见WEB_W14_REVISED_NOTICE_SUBMISSION.md。此处仅说明App变动，两端均未运行验收。

仅源码与diff静态复核，未测试、编译、格式化、分析器、浏览器或业务接口调用。待整批交付后同事覆盖：勾选后逐项编辑、同值选择、动态分期分成增删、证据变更、重读新版本、412及原请求恢复。

源码SHA256：`cf7b559060cdcf5e85c6d4dfa46810201c9b7bbebe8293b73002944c9b444721`

补充独审修正：selectPerson 开始改走 draftChanged，并在写 person.text 前撤销 agreed；同人重读亦撤销。避免 controller listener 与外层 setState 嵌套；原请求和恢复不变。
