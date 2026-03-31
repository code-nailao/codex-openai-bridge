# Development Guide

## 当前状态说明

仓库已经完成 `0.1.1` 的 v1 基线实现。

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
  observability/
    bridge-logger.ts
    file-log-sink.ts
    request-logging.ts
  config/
    env.ts
    models.ts
    runtime-policy.ts
  contracts/
    runtime.ts
  runtime/
    codex-client.ts
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
  services/
    health-service.ts
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
cp .env.example .env
```

### 启动开发服务

```bash
npm run dev
```

### 构建

```bash
npm run build
npm start
```

## 配置策略

配置统一收敛在 `src/config/env.ts`，业务逻辑内部不允许零散读取 `process.env`。

CLI 启动入口默认读取仓库根目录 `.env`；显式传入 `env` 的 programmatic path 不会再隐式混入本地 `.env`，避免测试和嵌入式调用被开发者机器配置污染。

当前主要配置项：

- `HOST`：默认 `127.0.0.1`
- `PORT`：默认 `8787`
- `LOCAL_BRIDGE_API_KEY`：鉴权开启时必填
- `BRIDGE_DISABLE_AUTH`：仅限本地调试时关闭鉴权
- `SQLITE_PATH`：SQLite 数据文件
- `CODEX_WORKSPACE_ROOT`：可选工作目录根；缺省时落到 `.codex-openai-bridge/workspaces/default-chat`
- `HOME` / `CODEX_HOME`：可选；仅用于定位用户原始 Codex 认证缓存来源
- `BRIDGE_ENABLE_CWD_OVERRIDE`：是否允许 `x-codex-cwd`
- `BRIDGE_ALLOWED_CWD_ROOTS`：cwd allowlist
- `BRIDGE_LOG_MODE`：日志模式，默认 `dev-file`
- `BRIDGE_LOG_DIR`：日志根目录，默认 `log/dev`
- `BRIDGE_LOG_CONTENT_MODE`：内容日志模式，默认 `none`
- `BRIDGE_LOG_MAX_CONTENT_CHARS`：内容日志预览最大字符数，默认 `2000`

原则：

- 配置校验失败要尽早启动失败
- 不把环境变量读取下沉到 adapter / route 细节
- workspace override 必须显式开启，并受 allowlist 约束
- 缺省 workspace 应落在隔离子目录，避免 bridge 默认读取仓库根或业务项目根
- 缺省 runtime home 应落在 `.codex-openai-bridge/runtime`，避免桥接默认继承用户全局 skills、`AGENTS.md` 与 Codex 用户级配置
- 运行时只允许从用户 `CODEX_HOME` 种入认证缓存；不得把用户 `config.toml`、`AGENTS.md` 或 skills 目录整体复制进桥接 runtime
- 模型选择默认由桥接层补为 `gpt-5.4`，客户端也可以显式覆盖
- `reasoning_effort` 默认由桥接层补为 `low`，客户端也可以显式覆盖

当前默认支持的请求模型 id：

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

### Bridge Codex client

`src/runtime/codex-client.ts` 负责桥接专用的 Codex client 装配，边界如下：

- 子进程级 `HOME` / `CODEX_HOME` 固定指向 `.codex-openai-bridge/runtime/home` 与 `.codex-openai-bridge/runtime/codex-home`
- 首次启动时只从用户 `CODEX_HOME` 复制 `auth.json`，保证本地登录态可用，但不继承用户级 `config.toml`、`AGENTS.md` 与全局 skills
- 明确设置 `cli_auth_credentials_store = "file"`，确保认证读取走隔离后的 `auth.json`
- 通过 `shell_environment_policy.set.HOME` 把工具子进程的 `HOME` 还原成真实用户 home，尽量降低 shell / CLI 工具因 home 变化带来的副作用
- 该层只负责 runtime 环境隔离，不负责请求映射、session 恢复或 HTTP 语义

### SessionStore

持久化层负责：

- 保存 `x-session-id -> codex_thread_id`
- 保存 `response_id -> thread_id/session_id`
- 保存请求模型 id、workspace、最近活动时间
- 为同一 session 串行化请求，避免 thread 并发续写

## 接口与兼容约束

### `POST /v1/chat/completions`

- 支持 `model`、`messages`、`stream`、`max_completion_tokens`、`reasoning_effort`
- 当 `model` 缺失时默认按 `gpt-5.4` 执行
- 当 `reasoning_effort` 缺失时默认按 `low` 执行
- 出于兼容性考虑，`reasoning_effort: null`、空字符串、空白字符串或 `"none"` 会按缺失字段处理，并回落到默认 `low`
- 只支持文本内容
- 对 `tools`、`audio`、`response_format` 等未实现字段返回 `422 unsupported_feature`
- 优先保持客户端消息历史驱动语义，不依赖隐藏 thread 记忆保证正确性

### `POST /v1/responses`

- 支持 `model`、`input`、`instructions`、`stream`、`previous_response_id`
- 当 `model` 缺失时默认按 `gpt-5.4` 执行
- 当 `reasoning_effort` 缺失时默认按 `low` 执行
- 出于兼容性考虑，`reasoning_effort: null`、空字符串、空白字符串或 `"none"` 会按缺失字段处理，并回落到默认 `low`
- `previous_response_id` 与 `x-session-id` 可恢复已有 thread
- 两者冲突时返回 `409 session_conflict`
- `responses` 是 thread 续接主路径

### `GET /v1/models`

- 返回本地桥接允许的直接模型 id 列表
- 不做远端探测

### `GET /healthz`

- 返回最小健康信息
- 覆盖 SQLite 可用性与缓存后的 `codex --version` 状态
- 不触发真实推理

## SSE 处理原则

- `chat/completions` 输出 `chat.completion.chunk` 与 `[DONE]`
- `responses` 输出 `response.created`、`response.output_text.delta`、`response.output_text.done`、`response.completed`
- 每 `15s` 发送 heartbeat，降低代理断连风险
- 客户端断开连接时，通过 `AbortController` 取消底层 run
- 流式输出是消息片段级 diff，不承诺 token 级逐字流
- 当底层 runtime 早期片段被后续快照修订时，桥接层会尽量避免把 provisional 文本重复暴露给客户端

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

## 安全边界补充

- 该项目应被视为 localhost compatibility bridge，而不是公网 reverse proxy
- 如果关闭鉴权、开放非 `127.0.0.1` 监听或放开 workspace 约束，风险模型会立刻变化
- 即使本桥不直连第三方中转站 REST，底层 Codex 仍可能把请求发送到其官方后端，因此输入给桥的内容仍要按敏感数据处理

## 日志原则

默认日志应记录：

- `request_id`
- `session_id`
- `thread_id`
- `model`
- `stream`
- `reasoning_effort`
- `latency`
- `status`
- `request_chars`
- `response_chars`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `error_type`
- `error_code`

补充约束：

- 流式与非流式请求都必须在 run 结束后补齐 token usage，不能因为 SSE 路径而丢失 `input_tokens` / `output_tokens` / `total_tokens`
- 对失败请求，允许补充低风险原始诊断字段，例如 `request_body_kind`、`request_body_keys`、`request_reasoning_effort_raw`，帮助排查“字段明明没传却报错”的问题

默认不记录：

- prompt 正文
- 完整响应正文
- 未脱敏环境变量

显式开启内容日志时：

- `BRIDGE_LOG_CONTENT_MODE=errors-only`：仅失败请求记录脱敏后的请求/响应预览
- `BRIDGE_LOG_CONTENT_MODE=full`：所有请求记录脱敏后的请求/响应预览
- 所有预览都必须先脱敏，再按 `BRIDGE_LOG_MAX_CONTENT_CHARS` 截断
- 预览日志只允许作为本地诊断能力，不允许把默认模式改成全量正文落盘
- 即使 `BRIDGE_LOG_CONTENT_MODE=none`，失败请求也应尽量保留低风险结构化诊断字段，而不是只留下一个孤立的 `400`

当前默认本地开发日志布局：

- 根目录：`log/dev`
- 月目录：`log/dev/yy-mm`
- 日志文件：`log/dev/yy-mm/yy-mm-dd.log`
- 格式：每行一条 JSON

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
