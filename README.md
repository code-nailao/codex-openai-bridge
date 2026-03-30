# codex-openai-bridge

> 把本地 Codex 包装成 OpenAI-compatible API 的 localhost sidecar。

[![Version](https://img.shields.io/badge/version-0.1.0-0f766e.svg)](./CHANGELOG.md)
[![Status](https://img.shields.io/badge/status-v1%20implemented-0f766e.svg)](./docs/roadmap.md)
[![Scope](https://img.shields.io/badge/scope-localhost%20sidecar-111827.svg)](./docs/development.md)

## 项目定位

`codex-openai-bridge` 只做一件事：在本机 `127.0.0.1` 上提供一个 **OpenAI-compatible HTTP sidecar**，把你已经安装并配置好的本地 Codex CLI / SDK 包装成标准接口，让小项目、脚本、自动化工具继续沿用 OpenAI SDK 的接入方式。

它不是中转站，不是多租户网关，也不追求把 OpenAI 全接口一次性重写一遍。

这意味着：

- 上游唯一目标是 **本地 Codex**，不是第三方 REST 中转站
- 默认只监听 `127.0.0.1`
- 默认安全策略是 **bearer auth + read-only + approval=never**
- v1 聚焦 **文本、SSE、session 续接、最小兼容性**，不追求接口面炫技式铺开

## 当前状态

- 当前版本：`0.1.0`
- 当前阶段：`V1 implemented`
- 当前仓库内容：可运行服务、契约测试、开发文档、roadmap 与协作规范
- 已验证：`chat.completions` / `responses` / `models` / `healthz`，以及 OpenAI SDK `baseURL` 模式 smoke test
- 默认本地日志：`log/dev/yy-mm/yy-mm-dd.log`

## 核心特性

- **OpenAI-compatible surface**：支持 `POST /v1/chat/completions`、`POST /v1/responses`、`GET /v1/models`、`GET /healthz`
- **Local Codex only**：底层只对接本地 Codex CLI / SDK
- **Session continuity**：通过 SQLite 管理 `x-session-id`、`response_id` 与 Codex thread 映射
- **SSE first**：同时支持流式 SSE 与非流式 JSON
- **Text assistant gateway**：默认只做文本助手网关，拒绝 multimodal / tools / strict structured output
- **Operationally safe**：请求中断可取消 run，审批需求转成明确错误，不让 HTTP 请求悬挂

## v1 支持范围

| 接口 | 语义 | v1 状态 |
| --- | --- | --- |
| `POST /v1/chat/completions` | OpenAI-compatible chat surface，支持文本输入、流式与非流式 | implemented |
| `POST /v1/responses` | OpenAI-compatible responses surface，承担 thread 续接主路径 | implemented |
| `GET /v1/models` | 返回本地桥接允许的直接模型 id 列表 | implemented |
| `GET /healthz` | 健康检查：HTTP 存活、SQLite 可用性与缓存后的 `codex --version` 状态 | implemented |

### 请求头契约

- `Authorization: Bearer <LOCAL_BRIDGE_API_KEY>`：本地桥接服务鉴权，默认开启
- `x-session-id`：可选；命中已有会话时续接上下文
- `x-codex-cwd`：可选管理员能力；默认关闭，只允许落在 allowlist 根目录下

### 返回与错误契约

- `/v1/chat/completions`：返回 `chat.completion` / `chat.completion.chunk`
- `/v1/responses`：返回 `response` 与常用文本事件子集
- 错误体统一采用 OpenAI 风格：`{ error: { message, type, code, param? } }`
- 所有成功响应回写 `x-session-id` 与 `x-codex-thread-id`
- 当客户端未传 `model` 时，桥接层默认使用 `gpt-5.4`
- 当客户端未传 `reasoning_effort` 时，桥接层默认使用 `medium`

### 当前支持的模型 id

- `gpt-5.4`
- `gpt-5.3-codex`
- `gpt-5.2`
- `gpt-5.2-codex`
- `gpt-5.1-codex-max`
- `gpt-5.1-codex-mini`

## 明确不做的 v1 能力

以下能力不属于 v1 承诺范围：

- 多模态输入输出
- tool calling / function calling
- 图像与音频
- strict JSON schema structured output
- 浏览器直连 / WebSocket 传输
- 远端多租户鉴权
- 直接调用中转站 REST

这些方向进入后续版本评估，但不会挤占 v1 的稳定性目标。

## 快速开始

### 运行前提

- Node.js `22.x`
- 已安装并可用的 Codex CLI / 本地 Codex 环境
- 本机允许启动 localhost sidecar

### 安装与启动

```bash
npm install
cp .env.example .env
npm run dev
```

默认监听：`http://127.0.0.1:8787/v1`

默认启动入口会自动读取仓库根目录 `.env`；同名 shell 环境变量优先级更高。

### 常用环境变量

- `HOST`：默认 `127.0.0.1`
- `PORT`：默认 `8787`
- `LOCAL_BRIDGE_API_KEY`：默认鉴权密钥；鉴权开启时必填
- `SQLITE_PATH`：SQLite 存储文件路径
- `CODEX_WORKSPACE_ROOT`：可选工作目录根；缺省时落到 `.codex-openai-bridge/workspaces/default-chat`
- `BRIDGE_ENABLE_CWD_OVERRIDE`：是否允许 `x-codex-cwd`
- `BRIDGE_ALLOWED_CWD_ROOTS`：可选 cwd allowlist，逗号分隔
- `BRIDGE_LOG_MODE`：日志模式，默认 `dev-file`
- `BRIDGE_LOG_DIR`：日志根目录，默认 `log/dev`
- `BRIDGE_LOG_CONTENT_MODE`：内容日志模式，默认 `none`；可选 `errors-only`、`full`
- `BRIDGE_LOG_MAX_CONTENT_CHARS`：内容日志预览最大字符数，默认 `2000`
- `BRIDGE_DISABLE_AUTH=true`：仅限本地受控环境调试时关闭鉴权
- 模型选择不写在 env；每次请求可以显式传 `model`，不传时默认 `gpt-5.4`
- `reasoning_effort` 不写在 env；每次请求可以显式传值，不传时默认 `medium`

### OpenAI SDK 接入示例

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:8787/v1',
  apiKey: process.env.LOCAL_BRIDGE_API_KEY,
});

const completion = await client.chat.completions.create({
  model: 'gpt-5.4',
  reasoning_effort: 'medium',
  messages: [{ role: 'user', content: 'Say hello.' }],
});

console.log(completion.choices[0]?.message.content);
```

```ts
const response = await client.responses.create({
  model: 'gpt-5.3-codex',
  reasoning_effort: 'high',
  input: 'Summarize this file.',
});

console.log(response.output_text);
```

### `curl` 示例

```bash
curl http://127.0.0.1:8787/v1/models \
  -H "Authorization: Bearer ${LOCAL_BRIDGE_API_KEY}"
```

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer ${LOCAL_BRIDGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [{ "role": "user", "content": "Say hello." }]
  }'
```

```bash
curl http://127.0.0.1:8787/v1/responses \
  -H "Authorization: Bearer ${LOCAL_BRIDGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "reasoning_effort": "medium",
    "input": "Explain what this repository does."
  }'
```

## 运行与安全约束

- 只监听 `127.0.0.1:8787`
- 默认要求 `Authorization: Bearer <LOCAL_BRIDGE_API_KEY>`
- 默认 `sandbox=read-only` 与 `approval=never`
- 默认只记录最小化运维日志与请求/响应长度统计，不记录 prompt / response 正文
- 需要排障时可显式开启 `BRIDGE_LOG_CONTENT_MODE=errors-only|full`；预览内容会先脱敏，再按 `BRIDGE_LOG_MAX_CONTENT_CHARS` 截断
- 默认以 JSON lines 写本地开发日志到 `log/dev/yy-mm/yy-mm-dd.log`
- 默认工作目录落在隔离子目录 `.codex-openai-bridge/workspaces/default-chat`；`x-codex-cwd` 默认关闭
- 这更准确地说是本地兼容桥，不是面向公网的通用反代；一旦暴露到 localhost 之外，风险会显著上升
- 如果 Codex 仍触发审批事件，桥接层返回明确错误，而不是把 HTTP 请求挂死

## 兼容语义摘要

- `responses` 是 thread 续接主路径
- `chat/completions` 优先保持“客户端消息历史驱动”的兼容语义
- `chat/completions` 的流式输出是消息片段级 diff，不承诺严格 token 级流式
- `sub2api` 只作为路由兼容、SSE 和 sticky session 的设计参考，不作为运行时核心
- `codex app-server` 被保留为 v2 优化项，不作为 v1 基座

## 项目结构

```text
src/
  adapters/
  observability/
  config/
  contracts/
  runtime/
  server/
  services/
  store/
  utils/
tests/
```

职责分层：

- `server/` 负责 HTTP、鉴权、SSE、错误边界
- `runtime/` 负责本地 Codex thread 生命周期
- `adapters/` 负责 OpenAI-compatible 请求和响应映射
- `store/` 负责 SQLite 持久化与 session 串行化
- `config/` 负责配置与运行策略

## 开发与验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

如果修改 SSE、session 恢复、错误映射或兼容层行为，必须补对应契约测试或回归测试。

## 路线图摘录

### 已完成的 v1 基线

- Fastify localhost sidecar
- Codex SDK runtime 封装
- SQLite session store
- `chat/completions`、`responses`、`models`、`healthz`
- SSE、错误映射、OpenAI SDK 兼容 smoke test

### Next

- `codex app-server` 优化路径
- 更多 event surface
- structured output / tools / multimodal
- SDK 化与可观测性增强

详细任务见：[`docs/roadmap.md`](./docs/roadmap.md)

## 文档导航

- 协作约定：[`AGENTS.md`](./AGENTS.md)
- 开发说明：[`docs/development.md`](./docs/development.md)
- 详细 roadmap：[`docs/roadmap.md`](./docs/roadmap.md)
- 变更记录：[`CHANGELOG.md`](./CHANGELOG.md)
- 当前版本：[`VERSION`](./VERSION)

## 设计借鉴

以下开源项目帮助我们校准 README 组织方式、接口边界表达和产品叙事，但本项目不会复制它们的实现路线或文案：

- [`Wei-Shaw/sub2api`](https://github.com/Wei-Shaw/sub2api)
- [`Emanuele-web04/remodex`](https://github.com/Emanuele-web04/remodex)
- [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch)

## 贡献方式

欢迎继续补强 v1 之后的能力，但请先确保：

- 不打破 localhost-only 与 Local Codex only 的边界
- 不模糊 v1 与 Next 的界线
- 不为了未来能力提前引入重型抽象
- 行为边界、接口契约、版本变化同步更新到文档

开始贡献前，请先读：[`AGENTS.md`](./AGENTS.md) 和 [`docs/development.md`](./docs/development.md)。
