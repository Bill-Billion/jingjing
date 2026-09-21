# 双人+双Codex分工

## Core Stream
人员：你 + Codex A
长期拥有：
- backend
- database/schema/migration
- workers
- providers
- contracts/openapi
- payment/refund
- rights/license
- finance/settlement
- server tests

系统事实由Core负责。

## Experience Stream
人员：队友 + Codex B
长期拥有：
- Flutter
- A/B统一Web
- Design System
- client integration
- Android/iOS/Web build
- 真机与响应式

用户体验由Experience负责。

## 单一Owner
Core唯一修改：schema、migration、OpenAPI主文件、服务端状态枚举、Provider接口、财务计算。
Experience唯一修改：Flutter页面/组件/Theme、Web页面/组件/Theme、客户端导航和SDK wrapper。

如果Experience需要新接口，提交Contract Change Request，不直接改backend。

## 强制交叉Review的共享边界
只限：
- schema/migration
- OpenAPI
- auth/permission
- payments/refunds
- rights/licenses
- settlement
- provider interfaces
- revoke/delete
- production release config

普通UI和模块内部实现不强制跨流review。

## Git
推荐：
main
  ^
integration
  ^              ^
core/<task>    ux/<task>

- 两个Codex使用不同worktree。
- Codex可以持续commit/push自己的分支。
- Task自验后进入integration。
- Shared Boundary先交叉Review。
- Critical Checkpoint通过后integration合main。
- Codex不得直接push main。

## Contract-first
Core先更新OpenAPI contract，Backend和Experience并行。
Experience可使用根据contract生成的local/test stub，但production不能自动调用stub。

## Migration
只有Core创建migration，避免编号/状态冲突。

## 不按人类工时限制Codex
旧人时只作预算参考，不作为任务速度上限。
控制因素只有：依赖、测试、回归风险、可审计性。
