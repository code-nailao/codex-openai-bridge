# Development Guide

## 当前状态说明

当前仓库仍处于 **documentation bootstrap** 阶段。

这意味着：

- 已锁定项目定位、边界、v1 范围与长期维护约束
- 尚未创建 `package.json`、运行时代码、测试代码或服务脚手架
- 本文描述的是 **未来实现阶段必须遵守的工程约束**，不是“当前代码已经实现的事实”

如果你准备开始写代码，请先阅读：

- [`../README.md`](../README.md)
- [`../AGENTS.md`](../AGENTS.md)
- [`./roadmap.md`](./roadmap.md)

## 开发基线

推荐把以下版本视为 v1 scaffold 的起步基线：

- Node.js `22.x`
- pnpm `10.x`
- Codex CLI `>= 0.114.0`
- SQLite `3.51.x` 或兼容版本

v1 的目标技术栈已经锁定为：

- Node.js
- TypeScript
- Fastify
- `@openai/codex-sdk`
- SQLite

## 目标目录结构

本轮不创建代码目录，但后续实现建议采用以下结构：

```text
server/
  routes/
  auth/
  sse/
  errors/
runtime/
  codex-runtime.ts
  thread-manager.ts
adapters/
  chat-adapter.ts
  responses-adapter.ts
  event-normalizer.ts
store/
  session-store.ts
  locks.ts
config/
  models.ts
  runtime-policy.ts
  env.ts
tests/
  contracts/
  integration/
  fixtures/
```

原则：

- `server/` 只处理 HTTP 协议与边界
- `runtime/` 只处理本地 Codex 调用与 thread 生命周期
- `adapters/` 只处理 OpenAI-compatible 语义映射
- `store/` 只处理状态持久化与并发控制
- `config/` 只处理配置与运行策略

## 本地开发模式

v1 实现后，推荐把开发模式分成三层：

### 1. Docs mode

- 维护 README、development、roadmap、changelog
- 不假设服务可运行
- 仅做 docs-only 验证

### 2. Scaffold mode

- 初始化 TypeScript、Fastify、SQLite 与测试基础设施
- 先打通 `GET /healthz` 与最小配置加载
- 不急于一次性实现全部 API surface

### 3. Runtime integration mode

- 接入 `@openai/codex-sdk`
- 验证 thread 创建、恢复、取消、usage 抽取
- 再逐步补 `chat/completions` 与 `responses`

## 配置策略

以下配置语义在实现前就已经锁定：

- 默认监听：`127.0.0.1:8787`
- 默认鉴权：`Authorization: Bearer <LOCAL_BRIDGE_API_KEY>`
- 默认 workspace 根：`CODEX_WORKSPACE_ROOT`
- 可选管理员头：`x-codex-cwd`，默认关闭
- 默认 sandbox：`read-only`
- 默认 approval：`never`
- 模型别名由本地配置维护，不做远端探测

实现配置层时，应遵守：

- 环境变量统一在 `config/env.ts` 收敛
- 不允许在业务逻辑内部零散读取 `process.env`
- 配置校验失败时尽早启动失败，不延迟到请求期

## 运行时原则

### Gateway API

HTTP 层负责：

- 鉴权
- 参数校验
- 路由分发
- SSE 输出
- 统一错误格式
- 响应头回写

HTTP 层不负责：

- 直接拼接 Codex thread 状态
- 直接访问 SQLite 细节
- 直接决定 OpenAI-compatible 业务语义

### CodexRuntime

运行时层负责：

- 启动 / 恢复本地 Codex thread
- 提供 `run()` 与 `runStreamed()` 能力
- 处理取消、超时、usage 抽取
- 把底层事件交给 adapter normalizer

运行时层不负责：

- 直接生成 OpenAI 响应 JSON
- 直接控制 HTTP 生命周期

### SessionStore

持久化层负责：

- 保存 `x-session-id -> codex_thread_id`
- 保存 `response_id -> thread_id/session_id`
- 保存模型别名、workspace、最近活动时间
- 对同一 session 加锁，避免 thread 并发续写

## 接口与兼容约束

v1 目标接口：

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/models`
- `GET /healthz`

### chat/completions

- 支持 `model`、`messages`、`stream`、`max_completion_tokens`、`reasoning_effort`
- v1 只支持文本内容
- 未实现字段如 `tools`、`audio`、非文本 content、strict JSON schema 应返回 `422 unsupported_feature`
- `chat/completions` 不依赖隐藏 thread 记忆保证正确性

### responses

- 支持 `model`、`input`、`instructions`、`stream`、`previous_response_id`
- `previous_response_id` 或 `x-session-id` 命中时恢复同一 thread
- 两者冲突时返回 `409 session_conflict`
- `responses` 是 thread 续接的主路径

## SSE 处理原则

流式设计在实现时必须遵守：

- `chat/completions` 输出 `chat.completion.chunk`
- `responses` 输出文本相关常用事件子集
- 每 `15s` 发送 heartbeat，降低代理断连风险
- 客户端断开连接时，通过 `AbortController` 取消底层 run
- 流式输出是消息片段级 diff，不承诺 token 级逐字流

## 错误映射原则

统一错误体：

```json
{
  "error": {
    "message": "...",
    "type": "...",
    "code": "...",
    "param": "..."
  }
}
```

推荐映射：

- Codex 启动失败 -> `503`
- 上游超时 -> `504`
- 上游 rate limit -> `429`
- approval required -> `409`
- 不支持字段 -> `422`
- session 冲突 / session 占用 -> `409`

不要把底层错误原样透传给客户端；需要先收敛为稳定的桥接层契约。

## 日志原则

默认日志只记录：

- `request_id`
- `session_id`
- `thread_id`
- `model`
- `latency`
- `status`

默认不记录：

- prompt 正文
- 完整响应正文
- 未脱敏环境变量

需要详细日志时，应通过显式 debug 开关开启，而不是默认扩大采集范围。

## 测试门槛

### docs-only 阶段

至少执行：

```bash
git diff --check
```

### v1 scaffold 之后

默认执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

建议把测试拆成：

- adapter contract tests
- session store tests
- SSE streaming tests
- error mapping tests
- compatibility smoke tests with OpenAI SDK baseURL mode

## Git 与交付纪律

- 默认使用 `codex/*` 特性分支
- 小功能一个 commit，一个 push
- 文档变更与行为变更不要混在同一个 commit
- 完成功能前先更新 roadmap，再写实现
- 发布前必须同步 `VERSION` 与 `CHANGELOG.md`

详细协作约束见：[`../AGENTS.md`](../AGENTS.md)。
