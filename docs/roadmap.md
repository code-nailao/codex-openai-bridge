# Roadmap

本文件是 `codex-openai-bridge` 的详细 TODO 主文件。

## 状态说明

- `done`：已完成并已落盘
- `backlog`：确认有价值，但不属于当前阶段承诺

## Bootstrap

| Item | Status | Goal | Done When | Implemented Location |
| --- | --- | --- | --- | --- |
| Repository contract | `done` | 写清项目定位、v1 边界、非目标与安全红线 | `README.md` 可独立解释项目，不依赖口头补充 | `README.md` |
| Collaboration rules | `done` | 固化人类与 agents 的协作纪律、TODO 规范、git 规则 | `AGENTS.md` 可直接指导后续协作 | `AGENTS.md` |
| Development constraints | `done` | 固化实现期的目录职责、配置策略、日志与测试门槛 | `docs/development.md` 可作为后续开发基线 | `docs/development.md` |
| Detailed roadmap | `done` | 将 Bootstrap、V1、Next 三层路线图分离 | `docs/roadmap.md` 明确区分已完成与后续增强 | `docs/roadmap.md` |
| Version baseline | `done` | 建立语义化版本与首版 changelog | `VERSION` 与 `CHANGELOG.md` 一致指向 `0.1.0` | `VERSION`, `CHANGELOG.md` |

## V1

| Item | Status | Goal | Done When | Implemented Location |
| --- | --- | --- | --- | --- |
| Fastify gateway scaffold | `done` | 初始化 HTTP service、路由装配与最小启动流程 | 服务可在 `127.0.0.1:8787` 启动 | `src/app.ts`, `src/index.ts` |
| Runtime policy and config | `done` | 固化 host、auth、workspace、sandbox、approval、直接模型目录与请求默认值等运行策略 | 配置集中校验，启动期即可发现缺失或冲突 | `src/config/env.ts`, `src/config/runtime-policy.ts`, `src/config/models.ts`, `src/config/request-defaults.ts` |
| SQLite session store | `done` | 持久化 session/thread/response 映射并提供互斥锁 | 服务重启后可恢复 session，同 session 不发生并发乱序 | `src/store/session-store.ts`, `src/store/locks.ts` |
| Codex runtime wrapper | `done` | 封装 `@openai/codex-sdk` 的 thread 创建、恢复、取消与 usage 抽取 | 统一暴露 `run()`、`runStreamed()`、abort 与 usage 结果 | `src/runtime/codex-runtime.ts`, `src/runtime/thread-manager.ts` |
| Event normalization | `done` | 将底层 Codex 事件收敛成桥接层内部事件 | `chat` 与 `responses` adapter 复用同一事件面 | `src/adapters/event-normalizer.ts`, `src/runtime/normalized-stream.ts` |
| Chat completions JSON | `done` | 实现 `POST /v1/chat/completions` 非流式文本路径 | 文本 `messages` 返回 assistant 内容、usage 和 session headers，并在缺省时补默认模型与思考强度 | `src/server/routes/chat-completions.ts`, `src/adapters/chat-adapter.ts` |
| Chat completions SSE | `done` | 实现 `chat.completion.chunk` 流式输出 | 客户端收到 role chunk、delta chunks、stop chunk 与 `[DONE]` | `src/server/sse/chat-stream.ts`, `src/server/sse/sse-stream.ts` |
| Responses JSON | `done` | 实现 `POST /v1/responses` 非流式路径与 thread 续接 | `previous_response_id` 与 `x-session-id` 可恢复同一 thread，并在缺省时补默认模型与思考强度 | `src/server/routes/responses.ts`, `src/adapters/responses-adapter.ts` |
| Responses SSE | `done` | 实现常用文本事件子集的流式输出 | 事件顺序稳定，可拼回完整文本输出 | `src/server/sse/responses-stream.ts`, `src/server/sse/sse-stream.ts` |
| Models and healthz | `done` | 补齐 `GET /v1/models` 与 `GET /healthz` | 返回本地允许的直接模型 id 与最小健康信息，不触发真实推理 | `src/server/routes/models.ts`, `src/server/routes/healthz.ts` |
| Error mapping and cancellation | `done` | 统一处理 approval、timeout、rate limit、unsupported feature 与 disconnect cancel | 错误体稳定，请求中断可取消底层 run | `src/server/errors/error-mapper.ts`, `src/server/auth.ts`, `src/server/request-headers.ts` |
| Compatibility validation | `done` | 用 OpenAI SDK `baseURL` 模式和契约测试做最小兼容验证 | 覆盖 headers、SSE、error body、session restore、unsupported feature | `tests/*.test.ts` |

## Next

| Item | Status | Goal | Done When | Planned Location |
| --- | --- | --- | --- | --- |
| `codex app-server` optimization | `backlog` | 评估是否将 app-server 引入为性能或协议优化层 | 有明确收益证明，且不破坏 v1 runtime 抽象 | `src/runtime/app-server-runtime.ts` |
| Richer event surface | `backlog` | 扩展更多 Responses / runtime 事件类型 | 新事件不会破坏现有 adapter contract 与 SSE 稳定性 | `src/adapters/event-normalizer.ts`, `src/adapters/responses-adapter.ts` |
| Structured output | `backlog` | 评估非 strict 模式的结构化输出支持 | 有明确字段约束与错误语义，不稀释 v1 文本路径 | `src/adapters/responses-adapter.ts` |
| Tool calling | `backlog` | 设计工具调用事件与安全边界 | 工具生命周期、权限模型与错误映射完整闭环 | `src/runtime/tool-runtime.ts`, `src/adapters/tool-adapter.ts` |
| Multimodal support | `backlog` | 评估图像 / 音频输入输出的接入路径 | 请求模型、存储策略和错误语义全部明确 | `src/adapters/multimodal-adapter.ts` |
| SDK extraction | `backlog` | 将桥接客户端或共享契约抽成可复用 SDK | API surface 稳定，不与服务实现强耦合 | `sdk/`, `packages/bridge-client/` |
| Observability hardening | `backlog` | 增强 metrics、tracing、sampling 与诊断接口 | 在不泄露 prompt 的前提下提升排障能力 | `src/server/observability/`, `docs/operations.md` |
