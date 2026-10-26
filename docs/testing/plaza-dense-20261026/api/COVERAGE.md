# 广场浏览器验收覆盖映射

36组行为检查由下列原始运行构成；35组自动断言通过，1组撤权使用真实截图/原请求链复核并追加只读HTTP。当前映射截图已逐图对照，已知差异与未覆盖范围保留在[主页审阅](../../../reviews/plaza-dense-20261026/VISUAL_HOME.md)和[子页审阅](../../../reviews/plaza-dense-20261026/VISUAL_SUBPAGES.md)。本表关闭视觉待审状态，原始自动运行JSON不改写。

视觉逐图发现旧 artist-detail 的“查看公开试镜方案”跳到未映射的 /auditions，三宽截图均显示“页面不存在”；旧脚本只点按钮，未核对目的路由。旧原始报告保留。新三宽运行已按 canonical /auditions/catalog、城市郑州、真实目录200和实际方案可见复验，且验证返回原艺人详情。

版本按逐行哈希区分：早期文案版26d1d0e9…，受影响UI修正版b95b7ffe…，中性“入口”末版0f38bca1…。末版仅重跑三宽search-directory；其他行为和图片沿用其未受该标签改动影响的明确版本，不把历史图冒称末版重拍。

| 用例 | 宽度 | 结果 | 原始运行 | 编译 bundle SHA-256 |
| --- | ---: | --- | --- | --- |
| channels-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| city-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| search-directory-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-entry-final.json](browser-runs/browser-results-visual-entry-final.json) | 0f38bca110bb0d9828a661e746d1ae65117d3ad4ef1bd339ad3f947ad57da123 |
| artist-detail-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-recheck.json](browser-runs/browser-results-visual-final-recheck.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| stock-detail-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| notice-forms-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-form320.json](browser-runs/browser-results-visual-final-form320.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| channels-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| city-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| search-directory-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-entry-final.json](browser-runs/browser-results-visual-entry-final.json) | 0f38bca110bb0d9828a661e746d1ae65117d3ad4ef1bd339ad3f947ad57da123 |
| artist-detail-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-recheck.json](browser-runs/browser-results-visual-final-recheck.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| stock-detail-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| notice-forms-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-recheck.json](browser-runs/browser-results-visual-final-recheck.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| channels-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| city-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| search-directory-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-entry-final.json](browser-runs/browser-results-visual-entry-final.json) | 0f38bca110bb0d9828a661e746d1ae65117d3ad4ef1bd339ad3f947ad57da123 |
| artist-detail-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-recheck.json](browser-runs/browser-results-visual-final-recheck.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| stock-detail-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| notice-forms-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-recheck.json](browser-runs/browser-results-visual-final-recheck.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| notice-types-results-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-interrupted.json](browser-runs/browser-results-interrupted.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| submission-no-consent-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-interrupted.json](browser-runs/browser-results-interrupted.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| missing-record-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-interrupted.json](browser-runs/browser-results-interrupted.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| network-recovery-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-completion.json](browser-runs/browser-results-completion.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| checkout-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-writes2.json](browser-runs/browser-results-writes2.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| submit-profile-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-writes2.json](browser-runs/browser-results-writes2.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| submit-role-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-writes2.json](browser-runs/browser-results-writes2.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| submit-create_drama-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-writes2.json](browser-runs/browser-results-writes2.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |
| artist-filters-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| stock-quote-change-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| artist-filters-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| stock-quote-change-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| artist-filters-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| stock-quote-change-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final.json](browser-runs/browser-results-visual-final.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| artist-unavailable-320 | 320 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-s05.json](browser-runs/browser-results-visual-final-s05.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| artist-unavailable-390 | 390 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-s05.json](browser-runs/browser-results-visual-final-s05.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| artist-unavailable-768 | 768 | PASS_FUNCTIONAL_AND_VISUAL_REVIEWED | [browser-results-visual-final-s05.json](browser-runs/browser-results-visual-final-s05.json) | b95b7ffe415cc0502737b8680cb162858d77f1e3249df9eb43286d73afb3594c |
| artist-revocation-390 | 390 | PASS_REVIEWED_CAPTURE_AND_FRESH_HTTP | [browser-results-writes2.json](browser-runs/browser-results-writes2.json) | abce4f031e310808cf734a89441fc6374eef08216f8f4b90dc279ae421058e03 |

本表原运行包含 755 次实际 HTTP，当前通过用例对应755次；HTTP次数不代表失败导航通过。5 次写入均限隔离合成资料。3 次受控浏览器断网单列，未当作后端真实错误。

写入为：一个未付原订单、PROFILE/ROLE/CREATE_DRAMA 各一份待独立审核投稿，以及第 8 位合成艺人的同意撤回。目录现在为 7 位，未重复撤回，也未伪造恢复原同意。

S06报价变化为三宽各一次明确标注的浏览器受控412；拦截的checkout未到后端，不计入真实HTTP或实际写入。它只验证清除旧报价/许可勾选、禁用购买和真实GET重读后的重新确认。真实创建未付订单与后台烟测仍引用原独立证据。

S05新版不可用布局另用三宽各一次受控GET409，先取得真实PNG再测试清图/空态；随后真实资产仍返回200，确认未再次撤权。此组证明新布局与UI恢复，原真实撤权请求链另列。

最后一次自动等待超时原因：Flutter 的公开详情标题可访问名称包含“公开授权 / 当前核对结果”，原脚本只匹配标题本句。保留的截图已经显示资料不可用且预览/保存按钮消失；原链路为图片 200 → 本人撤回 200 → 图片 409 ARTIST_CONSENT_REQUIRED。之后 3 次只读请求再次确认 WITHDRAWN、目录 7 位且旧资产仍拒绝。详见 [撤权复核](artist-revocation-verification.json)。此项明确记为截图与真实 HTTP 复核，不冒称原自动化全绿。

前期定位、滚轮、输入切焦点和 alertdialog 选择器已修正。中断原运行是为修正测试输入时序，在其写入前停止，后续浏览器关闭错误不是页面业务错误。正式来源表不依赖这些未通过的部分。

目录合成头像、色条视频不代表真实作品质量；未测生产、短信、真实支付、附件上传或外部提供商。未开放的其他业务入口只保留导航，不推断后端完成。

本轮联调服务、随机数据库与短期凭据已清理，共用MySQL及PR37独立体验环境保留；独立查询确认本轮库已不存在，5500/53781均停止监听。见[清理证据](joint-cleanup.json)。

[截图索引](browser-evidence/index.html) · [完整验收数据](browser-acceptance.json)
