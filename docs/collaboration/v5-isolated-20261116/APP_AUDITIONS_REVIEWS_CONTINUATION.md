# 16–18 / 41 试镜与评价续批
依据：原画布观察记录直接读取 Figma 4016:7597（79%）及41此前截图描述；本批未重新截图，未做渲染验收。
基线：submission-isolated / handoff/v5-isolated-20261116，既有艺人三文件冻结保留。
备份：仓库外 库外备份。增量补丁亦在该目录，仓库仅留本说明。

## 实际代码
- 16 auditions_pages.dart / _bookingForm：保留真人占位图标而非假肖像、真实28px价及时间/地址/用途/成年确认；城市/范围条件拼接，缺字段不显示null。没有添加无请求字段的联系人或假草稿。
- 17 auditions_actions.dart / build delivery：把真实照片数、视频数、验收起点/小时及本单person_id整理成默认交付规则卡；明确不自动私人归档。原两种材料选择卡、实际已选进度、取样授权/刷新/提交前二次核验和权限完整保留。person_id只标档案，不冒充姓名或权利所有人。
- 18 engagement_pages.dart / reviewsView：实际原订单选择及选中原单标题/净付款/版本整理成卡，三维星级分区。三维值、原订单真实确认、附图、提交及结果验证未改。
- 41 auditions_offer_form.dart 与 auditions_pages.dart PUBLISHED visibility：实际public_booking/public_price改右侧SwitchListTile，调用原V5Form change与enabled，初值/restore/version/body不变。移出bool字段的两项通过factsBuilder补回原确认面板，避免确认丢失公开选择。新方案仍独立审核，已发布方案仍原版本保存，不造预览。

## 明确未齐
- 16起约联系人不在预约请求中，联系卡属原单另给同意流程；不合并写入。没有草稿接口或本页直接付款确认。
- 17本页只选择已上传获准素材，不改成上传按钮。私人归档本人另给同意仍在baseplate流程；交付本身不允许无有效取样授权继续。
- 18没有快捷标签契约，未新增。提交仍原页面内按钮，未迁移固定底栏；稍后/草稿不伪造保存。
- 41开关通过本地extra置于字段末尾，未修改共享V5Form来强制原稿顺序；城市/价格/规则/时段/交通条件保留全部真实必填项。没有公共预览端点故不加预览。
- 本批不是四屏像素级全量完成。固定底栏需要共享表单提交/恢复/离页状态接口协调，本批不绕过或重复提交。

## 静态核对
已阅读V5Form本地构造、extra/change、initial/restore、dirty、factsBuilder确认与提交禁用逻辑，使用现有参数。
仅人工读源码与git diff；未测试、编译、analyzer、formatter、运行App或调用业务接口；未commit/push。交同事固定PM03版本及同记录ID待测。
## 保存指纹 SHA256
- 晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/auditions/auditions_actions.dart: 8b70f7b58a5d9f82738f730418003a9ce956fbe8ac3b44fbb4edcb4e80652a64
- 晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/auditions/auditions_offer_form.dart: ca5e24e1fd609c89d3c3dcbd159ff8fdc847e1cee5388028922e4423721e8e48
- 晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/auditions/auditions_pages.dart: f341b0a4f6662235f3b5f79d31d62e87d6101f32b341cac9ec962113f0f8d440
- 晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/lib/engagement/engagement_pages.dart: de16905a302b471d8f20cc215223e1e9d3bf8dba5145b7aebf045d5217f0baea

## 底栏续补
18：从reviewsView完整提取原发布按钮到reviewSubmitAction；独立页使用tradeScaffold.footer，嵌入页只在正文保留一次。不新增提交代理，不复制业务体，所有原ready条件、submit/act、结果验证仍唯一原实现；未更动其他view。独立评价页busy也锁定离页，恢复未知操作仍由原feedback处理。没有伪造“稍后保存”按钮。
16/17具体阻塞：V5Frame支持footer，但V5Form仅把固定tradeButton放在内部build，缺少actionBuilder/隐藏正文按钮/导出统一动作Widget接口；其内部busy/completed/pending/conflict/reviewed与_frame.formChanged刷新必须共同保持。GlobalKey调用submit既无法移除原按钮，又会让父footer复制锁条件/出现过期状态，因此不这样做。
建议协调共享表单拥有者加默认关闭的footer动作出口：由V5Form内部生成原唯一按钮，通过V5Frame注册并以formChanged刷新；启用时正文不再输出按钮，Frame仍统一管理dirty与leave，多表单仅允许明确指定主操作。该共享改动影响全部V5表单，不能在仅本模块范围强改。本批未改共享文件，也未测试。
