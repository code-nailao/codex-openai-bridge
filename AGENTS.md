# AGENTS.md

## 目标

这是 `codex-openai-bridge` 的根级协作约定，适用于人类开发者与所有 coding agents。

本仓库追求：

- 边界清楚
- 高内聚、低耦合
- 先设计、后实现
- 小步提交、可回溯历史
- 长期维护优先于短期炫技

如果一个改动只是“先糊上去能跑”，但会提高未来维护成本，那么它不是合格改动。

## 当前项目约束

在没有明确变更设计前，以下约束视为项目红线：

- 项目形态是 **localhost sidecar**，不是云端网关，也不是多租户平台
- 上游唯一目标是 **本地 Codex CLI / SDK**，不直连第三方 REST 中转站
- v1 只承诺 **文本助手网关**，不承诺 multimodal、tools、strict structured output
- 默认运行策略是 `read-only + approval=never`
- 默认网络监听仅限 `127.0.0.1`
- 默认开启 bearer auth
- `responses` 是 thread 续接主路径；`chat/completions` 优先保持消息历史驱动语义
- `sub2api` 只可用于设计参考，不得直接当作运行时核心拼装
- `codex app-server` 只作为后续优化选项，不得反向劫持 v1 架构

## 工作方式

默认按 staff-level engineer 标准工作：

- 先确认产品边界，再落代码结构
- 先做最小稳定抽象，再考虑扩展性
- 设计模式只在能明显降低耦合、提高可维护性时使用
- 不为了展示“架构感”引入多余层次
- 新增约束必须写文档，不能只留口头说明

交付前先问自己：

> 这个结果是否能经受一次严格的大厂 code review？

## TODO 双轨制

本项目采用文档级 TODO 与代码级 TODO 并行管理。

### 文档级 TODO

- 所有 roadmap、版本阶段、公开承诺统一维护在 [`docs/roadmap.md`](./docs/roadmap.md)
- README 只保留高层摘要，不承担详细任务跟踪
- 当范围、优先级或完成定义变化时，先更新 roadmap，再开始实现

### 代码级 TODO

代码内允许保留 TODO，但只能用于 **明确扩展点**，不能用来掩盖未设计清楚的问题。

代码 TODO 必须满足：

- 紧贴预留扩展点
- 写清原因，而不是只写“以后再做”
- 写清约束或触发条件
- 能指向下一步实现入口

推荐格式：

```ts
// TODO(v2-runtime): support tool events here once response event surface is stabilized.
// Context: v1 only normalizes text events; adding tool events now would widen the adapter contract.
```

禁止出现以下低质量 TODO：

- `TODO: fix later`
- `TODO: optimize`
- `TODO: support more`

## 文档同步规则

以下事项发生变化时，必须同步更新文档：

- 行为边界
- 公开接口
- 配置方式
- 安全策略
- git / release 流程
- 版本号与路线图

默认至少同步这些文件：

- [`README.md`](./README.md)
- [`docs/development.md`](./docs/development.md)
- [`docs/roadmap.md`](./docs/roadmap.md)
- [`CHANGELOG.md`](./CHANGELOG.md)

## 目录与分层原则

当前仓库仍处于 bootstrap 阶段，但后续实现必须遵守以下职责分层：

- `server/`：HTTP routes、auth、headers、SSE writer、error mapper
- `runtime/`：Codex SDK / CLI runtime 封装、thread 恢复、取消、usage 抽取
- `adapters/`：OpenAI request normalization、response mapping、event normalization
- `store/`：SQLite 持久化、session mapping、并发控制
- `config/`：模型别名、运行策略、环境变量收敛
- `tests/`：契约测试、适配层测试、兼容性测试、SSE 回归测试

禁止把 HTTP、会话持久化、Codex runtime 和 OpenAI 适配逻辑揉进一个文件或一个“万能 service”。

## Git 规则

本仓库默认采用 `codex/*` 短分支工作流。

- 不在 `main` 直接做功能开发
- 分支名默认使用 `codex/<topic>`
- commit message 使用 Conventional Commits，例如：
  - `docs: bootstrap repository contract`
  - `feat: add responses session restore`
  - `fix: map approval required to conflict error`
- 小功能完成就提交并 push，不堆大批量混合改动
- 一个 commit 只表达一个主要意图
- 不在未说明的情况下改写历史
- 不回滚不是自己造成的改动
- 不做 destructive git 操作，除非得到明确要求

## 安全与运行红线

任何实现都不能突破这些默认安全边界，除非文档与版本说明一起变更：

- 仅监听 `127.0.0.1`
- 默认要求 bearer auth
- 默认 `sandbox=read-only`
- 默认 `approval=never`
- 默认不记录 prompt 正文
- 默认 workspace 限制在 allowlist 根目录内
- 发现 approval 事件时，返回明确错误，不让请求悬挂

## 测试与验证要求

文档改动至少要做：

```bash
git diff --check
```

代码改动默认要覆盖：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

如果涉及 SSE、session 恢复、错误映射或兼容层行为变更，必须补对应契约测试或回归测试。

## Done 定义

一个任务完成，至少满足：

- 设计没有因为最后几次修补而失去一致性
- 代码或文档不需要额外口头解释才能理解
- 约束、边界、非目标写清楚了
- 验证是 fresh 的，不是“应该跑过”
- 对用户可见的变更已经同步到相关文档

## Review Checklist

Review 时请主动检查：

- 这是清晰抽象，还是补丁叠补丁？
- 是否保持高内聚、低耦合？
- 是否把 v1 与 Next 的边界写清楚？
- 是否把 thread / session / SSE 语义放在了正确层？
- 是否同步更新了 README、development、roadmap、changelog？
- TODO 是否有上下文，还是只是把问题留给未来？
