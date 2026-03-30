# codex-openai-bridge

> 把本地 Codex 包装成 OpenAI-compatible API 的 localhost sidecar。

[![Version](https://img.shields.io/badge/version-0.1.0-0f766e.svg)](./CHANGELOG.md)
[![Status](https://img.shields.io/badge/status-documentation%20bootstrap-c2410c.svg)](./docs/roadmap.md)
[![Scope](https://img.shields.io/badge/scope-localhost%20sidecar-111827.svg)](./docs/development.md)

## 项目定位

`codex-openai-bridge` 的目标不是再造一个中转站，也不是把 OpenAI API 全量重写一遍。

它只做一件事：在本机 `127.0.0.1` 上提供一个 **OpenAI-compatible HTTP sidecar**，把你已经安装并配置好的本地 Codex CLI / SDK 包装成标准接口，让小项目、脚本、自动化工具可以继续沿用 OpenAI SDK 的接入方式。

这意味着：

- 上游唯一目标是 **本地 Codex**，不是第三方 REST 中转站
- 默认只监听 `127.0.0.1`
- 默认安全策略是 **bearer auth + read-only + approval=never**
- v1 聚焦 **文本、SSE、session 续接、最小兼容性**，不追求接口面炫技式铺开

## 当前状态

- 当前版本：`0.1.0`
- 当前阶段：`Documentation Bootstrap`
- 当前仓库内容：产品契约、协作约束、开发约定、roadmap
- 代码实现状态：**尚未进入 v1 scaffold**

如果你现在来到仓库首页，应该把它理解为：

- 已经锁定了产品边界
- 已经锁定了 v1 范围与非目标
- 已经锁定了工程与 git 纪律
- 下一阶段才会开始服务代码实现

## 核心特性

以下是项目的 v1 目标能力，不代表当前仓库已经全部实现：

- **OpenAI-compatible surface**：优先支持 `POST /v1/chat/completions`、`POST /v1/responses`、`GET /v1/models`
- **Local Codex only**：底层只对接本地 Codex CLI / SDK
- **Session continuity**：通过 SQLite 管理 `x-session-id`、`response_id` 与 Codex thread 映射
- **SSE first**：同时支持流式 SSE 与非流式 JSON
- **Text assistant gateway**：默认只做文本助手网关，拒绝未实现的 multimodal / tools / strict structured output
- **Operationally safe**：请求中断可取消 run，审批需求转成明确错误，不让 HTTP 请求悬挂

## v1 支持范围

| 接口 | 目标语义 | v1 状态 |
| --- | --- | --- |
| `POST /v1/chat/completions` | OpenAI-compatible chat surface，支持文本输入、流式与非流式 | planned for v1 scaffold |
| `POST /v1/responses` | OpenAI-compatible responses surface，承担 thread 续接主路径 | planned for v1 scaffold |
| `GET /v1/models` | 返回本地桥接允许的模型别名列表 | planned for v1 scaffold |
| `GET /healthz` | 健康检查：HTTP、SQLite、Codex runtime 状态 | planned for v1 scaffold |

### 请求头契约

- `Authorization: Bearer <LOCAL_BRIDGE_API_KEY>`：本地桥接服务鉴权，默认开启
- `x-session-id`：可选；命中已有会话时续接上下文
- `x-codex-cwd`：可选管理员能力；默认关闭，只允许落在 allowlist 根目录下

### 返回与错误契约

- `/v1/chat/completions`：目标返回 `chat.completion` / `chat.completion.chunk`
- `/v1/responses`：目标返回 `response` 与常用文本事件子集
- 错误体统一采用 OpenAI 风格：`{ error: { message, type, code, param? } }`
- 所有成功响应目标回写 `x-session-id` 与 `x-codex-thread-id`

## 明确不做的 v1 能力

以下能力不属于 v1 承诺范围：

- 多模态输入输出
- tool calling / function calling
- 图像与音频
- strict JSON schema structured output
- 浏览器直连 / WebSocket 传输
- 远端多租户鉴权
- 直接调用中转站 REST

这些方向会进入后续版本评估，但不会挤占 v1 的稳定性目标。

## 快速开始

当前仓库还是文档 bootstrap，所以这里分为“现在能做什么”和“v1 落地后的目标接入方式”。

### 现在能做什么

1. 阅读项目边界与开发约束：[`docs/development.md`](./docs/development.md)
2. 阅读详细 TODO / roadmap：[`docs/roadmap.md`](./docs/roadmap.md)
3. 阅读协作契约：[`AGENTS.md`](./AGENTS.md)

### v1 落地后的目标接入方式

下面内容是 **planned for v1 scaffold**，用于说明未来接入形态，不代表当前仓库已经可运行。

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8787/v1",
  apiKey: process.env.LOCAL_BRIDGE_API_KEY,
});
```

```bash
# planned for v1 scaffold
pnpm install
pnpm dev
pnpm test
```

## 运行与安全约束

项目的运行边界已经提前锁定：

- 只监听 `127.0.0.1:8787`
- 默认要求 `Authorization: Bearer <LOCAL_BRIDGE_API_KEY>`
- 默认 `sandbox=read-only` 与 `approval=never`
- 默认不记录 prompt 正文，只记录最小化运维日志
- `CODEX_WORKSPACE_ROOT` 固定工作目录；`x-codex-cwd` 默认关闭
- 如果 Codex 仍触发审批事件，桥接层返回明确错误，而不是把 HTTP 请求挂死

## 兼容语义摘要

- `responses` 是 thread 续接主路径
- `chat/completions` 优先保持“客户端消息历史驱动”的兼容语义
- `chat/completions` 的流式输出是消息片段级 diff，不承诺严格 token 级流式
- `sub2api` 只作为路由兼容、SSE 和 sticky session 的设计参考，不作为运行时核心
- `codex app-server` 被保留为 v2 优化项，不作为 v1 基座

## 路线图摘录

### Bootstrap

- 文档契约、开发约束、版本基线、协作规范落盘
- 建立详细 roadmap 与 changelog 基线

### V1

- Fastify sidecar scaffold
- Codex SDK runtime 封装
- SQLite session store
- `chat/completions`、`responses`、`models`、`healthz`
- SSE、错误映射、最小兼容验证

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

当前最需要的是：

- 审视 v1 范围是否仍有边界漏洞
- 检查 OpenAI-compatible 契约是否足够稳定
- 检查 session / SSE / error mapping 的文档约束是否清楚
- 在开始写代码前，把长期维护成本降到最低

如果你准备贡献代码，请先读：[`AGENTS.md`](./AGENTS.md) 和 [`docs/development.md`](./docs/development.md)。
