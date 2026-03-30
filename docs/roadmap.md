# Roadmap

本文件是 `codex-openai-bridge` 的详细 TODO 主文件。

## 状态说明

- `done`：已完成并已落盘
- `planned`：已确定进入当前阶段，但尚未实现
- `backlog`：确认有价值，但不属于当前阶段承诺

## Bootstrap

| Item | Status | Goal | Done When | Planned Location |
| --- | --- | --- | --- | --- |
| Repository contract | `done` | 写清项目定位、v1 边界、非目标与安全红线 | `README.md` 可独立解释项目，不依赖口头补充 | `README.md` |
| Collaboration rules | `done` | 固化人类与 agents 的协作纪律、TODO 规范、git 规则 | `AGENTS.md` 可直接指导后续协作 | `AGENTS.md` |
| Development constraints | `done` | 固化实现期的目录职责、配置策略、日志与测试门槛 | `docs/development.md` 能作为 v1 scaffold 的工程约束基线 | `docs/development.md` |
| Detailed roadmap | `done` | 将 Bootstrap、V1、Next 三层路线图分离 | `docs/roadmap.md` 明确区分已完成、当前承诺与后续增强 | `docs/roadmap.md` |
| Version baseline | `done` | 建立语义化版本与文档 bootstrap 首版记录 | `VERSION` 与 `CHANGELOG.md` 一致指向 `0.1.0` | `VERSION`, `CHANGELOG.md` |

## V1

| Item | Status | Goal | Done When | Planned Location |
| --- | --- | --- | --- | --- |
| Fastify gateway scaffold | `planned` | 初始化 HTTP service、路由装配与最小启动流程 | 服务能在 `127.0.0.1:8787` 启动，具备基础 middleware 和错误骨架 | `server/index.ts`, `server/app.ts` |
| Runtime policy and config | `planned` | 固化 host、auth、workspace、sandbox、approval 等运行策略 | 配置集中校验，启动期即可发现缺失或冲突 | `config/env.ts`, `config/runtime-policy.ts`, `config/models.ts` |
| SQLite session store | `planned` | 持久化 session/thread/response 映射并提供互斥锁 | 服务重启后可恢复 session，同 session 不发生并发乱序 | `store/session-store.ts`, `store/locks.ts` |
| Codex runtime wrapper | `planned` | 封装 `@openai/codex-sdk` 的 thread 创建、恢复、取消与 usage 抽取 | 统一暴露 `run()`、`runStreamed()`、abort 与 usage 结果 | `runtime/codex-runtime.ts`, `runtime/thread-manager.ts` |
| Event normalization | `planned` | 将底层 Codex 事件收敛成桥接层内部事件 | `chat` 与 `responses` adapter 可复用同一事件面 | `adapters/event-normalizer.ts` |
| Chat completions JSON | `planned` | 实现 `POST /v1/chat/completions` 非流式文本路径 | 文本 `messages` 可返回单条 assistant 内容、usage 和 session headers | `server/routes/chat-completions.ts`, `adapters/chat-adapter.ts` |
| Chat completions SSE | `planned` | 实现 `chat.completion.chunk` 流式输出 | 客户端可收到 role chunk、delta chunks、stop chunk 与 `[DONE]` | `server/sse/chat-stream.ts`, `adapters/chat-adapter.ts` |
| Responses JSON | `planned` | 实现 `POST /v1/responses` 非流式路径与 thread 续接 | `previous_response_id` 与 `x-session-id` 可恢复同一 thread | `server/routes/responses.ts`, `adapters/responses-adapter.ts` |
| Responses SSE | `planned` | 实现常用文本事件子集的流式输出 | 事件顺序稳定，可拼回完整文本输出 | `server/sse/responses-stream.ts`, `adapters/responses-adapter.ts` |
| Models and healthz | `planned` | 补齐 `GET /v1/models` 与 `GET /healthz` | 可返回本地模型别名与最小健康信息，不触发真实推理 | `server/routes/models.ts`, `server/routes/healthz.ts` |
| Error mapping and cancellation | `planned` | 统一处理 approval、timeout、rate limit、unsupported feature 与 disconnect cancel | 错误体稳定，SSE 中断不会留下悬挂 run | `server/errors/error-mapper.ts`, `runtime/codex-runtime.ts` |
| Compatibility validation | `planned` | 用 OpenAI SDK `baseURL` 模式和 `curl` 做最小兼容验证 | 覆盖 headers、SSE、error body、session restore、unsupported feature | `tests/contracts`, `tests/integration` |

## Next

| Item | Status | Goal | Done When | Planned Location |
| --- | --- | --- | --- | --- |
| `codex app-server` optimization | `backlog` | 评估是否将 app-server 引入为性能或协议优化层 | 有明确收益证明，且不破坏 v1 runtime 抽象 | `runtime/app-server-runtime.ts` |
| Richer event surface | `backlog` | 扩展更多 Responses / runtime 事件类型 | 新事件不会破坏现有 adapter contract 与 SSE 稳定性 | `adapters/event-normalizer.ts`, `adapters/responses-adapter.ts` |
| Structured output | `backlog` | 评估非 strict 模式的结构化输出支持 | 有明确字段约束与错误语义，不稀释 v1 文本路径 | `adapters/responses-adapter.ts` |
| Tool calling | `backlog` | 设计工具调用事件与安全边界 | 工具生命周期、权限模型与错误映射完整闭环 | `runtime/tool-runtime.ts`, `adapters/tool-adapter.ts` |
| Multimodal support | `backlog` | 评估图像 / 音频输入输出的接入路径 | 请求模型、存储策略和错误语义全部明确 | `adapters/multimodal-adapter.ts` |
| SDK extraction | `backlog` | 将桥接客户端或共享契约抽成可复用 SDK | API surface 稳定，不与服务实现强耦合 | `sdk/`, `packages/bridge-client/` |
| Observability hardening | `backlog` | 增强 metrics、tracing、sampling 与诊断接口 | 在不泄露 prompt 的前提下提升排障能力 | `server/observability/`, `docs/operations.md` |
