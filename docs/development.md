# Development Guide

## 当前状态说明

仓库已经完成 `0.1.0` 的 v1 基线实现。

当前可用内容包括：

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/models`
- `GET /healthz`
- SQLite session / response store
- SSE streaming
- OpenAI-style error mapping
- OpenAI SDK `baseURL` smoke test

如果你准备继续开发，请先阅读：

- [`../README.md`](../README.md)
- [`../AGENTS.md`](../AGENTS.md)
- [`./roadmap.md`](./roadmap.md)

## 开发基线

推荐把以下版本作为当前仓库的实现基线：

- Node.js `22.x`
- npm `10.x` 或兼容版本
- Codex CLI `>= 0.114.0`
- SQLite `3.x` 兼容运行时

当前技术栈：

- Node.js
- TypeScript
- Fastify
- `@openai/codex-sdk`
- `better-sqlite3`
- Vitest
- `openai` SDK（兼容性测试）

## 当前目录结构

```text
src/
  adapters/
    chat-adapter.ts
    event-normalizer.ts
    responses-adapter.ts
    usage.ts
  config/
    env.ts
    models.ts
    runtime-policy.ts
  contracts/
    runtime.ts
  runtime/
    codex-runtime.ts
    normalized-stream.ts
    thread-manager.ts
  server/
    errors/
    routes/
    sse/
    auth.ts
    bridge-context.ts
    request-headers.ts
    session-resolution.ts
    workspace.ts
  store/
    locks.ts
    session-store.ts
  utils/
    ids.ts
tests/
  *.test.ts
  helpers/
  runtime/
```

职责分层：

- `server/` 只处理 HTTP 协议边界、鉴权、SSE、错误与 session 解析
- `runtime/` 只处理本地 Codex thread 生命周期
- `adapters/` 只处理 OpenAI-compatible 请求与响应映射
- `store/` 只处理 SQLite 持久化与并发控制
- `config/` 只处理配置与运行策略

## 本地开发

### 安装

```bash
npm install
```

### 启动开发服务

```bash
export LOCAL_BRIDGE_API_KEY="replace-me"
npm run dev
```

### 构建

```bash
npm run build
npm start
```

## 配置策略

配置统一收敛在 `src/config/env.ts`，业务逻辑内部不允许零散读取 `process.env`。

当前主要配置项：

- `HOST`：默认 `127.0.0.1`
- `PORT`：默认 `8787`
- `LOCAL_BRIDGE_API_KEY`：鉴权开启时必填
- `BRIDGE_DISABLE_AUTH`：仅限本地调试时关闭鉴权
- `CODEX_MODEL`：`codex` 别名对应的真实模型
- `SQLITE_PATH`：SQLite 数据文件
- `CODEX_WORKSPACE_ROOT`：默认工作目录根
- `BRIDGE_ENABLE_CWD_OVERRIDE`：是否允许 `x-codex-cwd`
- `BRIDGE_ALLOWED_CWD_ROOTS`：cwd allowlist

原则：

- 配置校验失败要尽早启动失败
- 不把环境变量读取下沉到 adapter / route 细节
- workspace override 必须显式开启，并受 allowlist 约束

当前默认支持的请求模型 id：

- `codex`
- `gpt-5`
- `gpt-5.4`
- `gpt-5.3-codex`
- `gpt-5.2`
- `gpt-5.2-codex`
- `gpt-5.1-codex-max`
- `gpt-5.1-codex-mini`

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

- 直接管理 Codex thread 细节
- 直接暴露 SQLite schema
- 在 route 内手写 OpenAI 协议对象拼装之外的复杂业务逻辑

### CodexRuntime

运行时层负责：

- 启动 / 恢复本地 Codex thread
- 提供 `run()` 与 `runStreamed()`
- 处理取消信号透传
- 统一返回 `threadId`、`usage` 与底层事件流

### SessionStore

持久化层负责：

- 保存 `x-session-id -> codex_thread_id`
- 保存 `response_id -> thread_id/session_id`
- 保存模型别名、workspace、最近活动时间
- 为同一 session 串行化请求，避免 thread 并发续写

## 接口与兼容约束

### `POST /v1/chat/completions`

- 支持 `model`、`messages`、`stream`、`max_completion_tokens`、`reasoning_effort`
- 只支持文本内容
- 对 `tools`、`audio`、`response_format` 等未实现字段返回 `422 unsupported_feature`
- 优先保持客户端消息历史驱动语义，不依赖隐藏 thread 记忆保证正确性

### `POST /v1/responses`

- 支持 `model`、`input`、`instructions`、`stream`、`previous_response_id`
- `previous_response_id` 与 `x-session-id` 可恢复已有 thread
- 两者冲突时返回 `409 session_conflict`
- `responses` 是 thread 续接主路径

### `GET /v1/models`

- 返回本地桥接允许的模型别名
- 不做远端探测

### `GET /healthz`

- 返回最小健康信息
- 不触发真实推理

## SSE 处理原则

- `chat/completions` 输出 `chat.completion.chunk` 与 `[DONE]`
- `responses` 输出 `response.created`、`response.output_text.delta`、`response.output_text.done`、`response.completed`
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

当前映射约束：

- Codex 启动失败 -> `503`
- 上游超时 -> `504`
- 上游 rate limit -> `429`
- approval required -> `409`
- 不支持字段 -> `422`
- session 冲突 -> `409`
- 无鉴权 -> `401`

不要把底层错误原样透传给客户端；需要先收敛为稳定的桥接层契约。

## 日志原则

默认日志只应记录：

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

## 测试门槛

文档改动至少执行：

```bash
git diff --check
```

代码改动默认执行：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

建议继续保持以下测试覆盖：

- adapter contract tests
- session store tests
- SSE streaming tests
- error mapping tests
- OpenAI SDK compatibility tests

## 下一阶段建议

v1 已经可运行，后续增强建议严格放在 `Next` 范围推进：

- richer event surface
- structured output
- tool calling
- multimodal
- `codex app-server` 优化路径
- observability hardening
