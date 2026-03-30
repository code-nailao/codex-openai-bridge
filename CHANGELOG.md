# CHANGELOG

本项目采用 [Semantic Versioning](https://semver.org/) 管理版本。

## [Unreleased]

### Added

- 新增根级 `.env.example`，提供本地启动配置模板
- 服务启动入口新增根级 `.env` 自动加载能力，且显式传入的环境变量优先级更高

### Changed

- 移除桥接层 `codex` 与 `gpt-5` 模型别名；请求必须直接传支持的真实模型 id
- 同步更新 README、development guide 与 roadmap 中的模型与配置说明
- 为 `chat/completions` 与 `responses` 收口默认请求语义：缺省 `model` 自动补 `gpt-5.4`，缺省 `reasoning_effort` 自动补 `medium`
- 缺省 `CODEX_WORKSPACE_ROOT` 调整为隔离子目录 `.codex-openai-bridge/workspaces/default-chat`，更适合纯对话型本地 sidecar

## [0.1.0] - 2026-03-30

### Added

- 新增根级 [`README.md`](./README.md)，明确项目定位、运行方式、v1 边界、快速开始与兼容语义
- 新增根级 [`AGENTS.md`](./AGENTS.md)，固化长期维护约束、TODO 双轨制、git 纪律、文档同步规则与安全红线
- 新增 [`docs/development.md`](./docs/development.md)，定义当前实现结构、配置策略、运行原则、错误映射与验证门槛
- 新增 [`docs/roadmap.md`](./docs/roadmap.md)，将 Bootstrap、V1、Next 三层路线图与状态落盘
- 新增 [`VERSION`](./VERSION) 作为当前版本基线

### Implemented

- 实现 Fastify localhost sidecar 与服务启动入口
- 实现运行配置、模型目录、workspace 约束与默认安全策略
- 实现 SQLite session / response store 与 session 串行化锁
- 实现 Codex runtime 封装、thread 恢复与事件归一化
- 实现 `POST /v1/chat/completions` 的 JSON 与 SSE 兼容路径
- 实现 `POST /v1/responses` 的 JSON 与 SSE 兼容路径，以及 `previous_response_id` / `x-session-id` 续接
- 实现 `GET /v1/models` 与 `GET /healthz`
- 实现统一鉴权、错误映射、approval required -> `409`、unsupported feature -> `422`

### Verified

- 新增 healthz、models、session store、event normalizer、chat、responses、errors、compatibility 测试
- 新增 OpenAI SDK `baseURL` 模式 smoke test，覆盖 `chat.completions.create()` 与 `responses.create()`
- 完整执行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`

### Governance

- 锁定默认安全策略：`127.0.0.1`、bearer auth、`read-only`、`approval=never`
- 锁定 v1 非目标：multimodal、tools、strict JSON schema、WebSocket、远端多租户鉴权、直接连中转站 REST
