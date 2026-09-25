# 作品、供给、私有材料和本人同意

version-policy.js不加载数据库、HTTP或供应商，只处理传入的可信版本记录。它不是授权接口。调用方必须先验证实际登录、当前身份、权限、私有文件归属、内容校验值、改稿来源及项目归属；不得直接把客户端传来的“已批准”记录作为输入。

- createVersion创建原作或项目改稿的明确版本。原作不填项目/来源；项目改稿须明确来源版本与项目。相同作品的新修订保留归属、作品类型和项目，不覆盖旧稿、不继承审核。
- submitVersion要求明确材料引用后才提交。材料引用不是已核验事实，存储层仍须核对私有文件与实际证据。
- reviewVersion分别记录权属RIGHTS与内容CONTENT核对。一个版本每类保留一份决定，补正需新版本重新审核，旧审核保留。未来的真实复核权限由服务器验证，纯规则不决定谁能审核。
- reviewProgress只汇总审核进度；REVIEWS_COMPLETE不是上架、许可、收费或发行权限。任一拒绝或要求补材料，都不会显示全部通过。
- withdrawVersion保留旧内容和审核记录，禁止继续提交或审核；并不定义已售许可的终止、退款或合同后果，这些由对应业务流程处理。

传入原object_version防止普通过期修改，但数据库原子更新与并发检查尚未接入。输出深拷贝并冻结，文件只存UUID引用及声明的校验值，未读取真实字节，不建立公开链接。

当前已接MySQL及15项公开供给接口：repository.js处理授权身份和事务，assets.js只在实际私有传输成功后标可用，consent-policy.js独立判断明确范围；supply-routes.js接实际登录。真实人员和外部服务未启用。独立验证：在backend_server运行`node --test test/works-version-policy.test.cjs`，不需要数据库或网络。

数据库与HTTP验证在backend_server执行`node scripts/test-mysql.js supply`，必须有隔离MySQL配置。审核维护使用已有受控governance-access.js，新增SUPPLY_REVIEW_PROFILE/RIGHTS/CONTENT/CONSENT。本人或同机构不得自审。

项目改稿默认拒绝，直到可信项目许可服务提供核验；同意范围匹配不是生成权限，实名/供应商尚未接通。撤回以现有outbox记录处置事件，本模块没有真实外部资产清理处理器。没有假实名、电子签、发布或许可结果。
