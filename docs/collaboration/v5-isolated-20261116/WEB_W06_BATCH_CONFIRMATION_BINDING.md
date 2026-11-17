# W06 机构批量办理确认与内容关联

## 问题与改动
修改前已在仓库外备份。本批仅修改 frontend_ops_workspace/src/components/business/OrganizationBatchPanel.vue，增加一个同步 watch；未改后端、全局台账或其他业务组件。

原 agreed 同时用于加入单项和提交整批，但更改价格、接手成员、原因、目标记录或移除清单项后，原勾选未失效。旧确认因此可能继续用于新内容；这不是已发生后端越权或错误办理的运行结论。

同步 watch 读取 mode、target、完整 detail（含 object_version）、price、account、reason、members 选择依据及 batch.items 完整内容的 JSON 快照。任一内容变化即 agreed=false，不依赖某个按钮点击，因此涵盖输入修改、目标/版本读取结果、成员依据刷新、清单新增/删除及内容变化。重复读取相同内容不会无故使确认失效；当前纯 JSON 业务 DTO 沿用已有类型与读取校验。

## 保留行为
不改原提交/恢复函数、pending 的原 body/key、操作版本、成功回执、逐项结果、已成功项不重办及身份/失权清理。已有 receipt 与 pending 继续沿原 locked 禁止编辑。watch 不监听 agreed 自身，不产生递归确认更新，也不重写请求。

批清单变化后须重新明确核对；不新增自动确认，不重建机构 App 动作，不改变原五项 Web 能力。

## 静态证据及待验
原 add 检查 agreed，原 submit 检查 agreed；新 watch 使用 flush: sync，在被观察内容变化时同步撤回旧确认。改动为一行说明及一行 watch，其他组件源码保持不变。

仅源码阅读、文本 diff 和哈希核对；未测试、编译、分析、格式化、浏览器或业务请求。输入修改、异步详情/成员更新、删项、原未知批次恢复、成功回执及权限变化的实际交互仍待集中联测，不能写为通过。未提交或推送。
