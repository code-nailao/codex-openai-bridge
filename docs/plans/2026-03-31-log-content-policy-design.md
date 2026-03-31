# 2026-03-31 Log Content Policy Design

## Goal

在不破坏默认安全边界的前提下，为桥接层增加可控的输入/输出内容日志能力，满足本地排障需求，但不把日志默认变成敏感数据堆积点。

## Chosen Approach

采用“双层日志”语义：

- 默认模式继续记录 access-style 元数据：`request_id`、`session_id`、`thread_id`、`model`、`status`、`latency`
- 额外补充低风险长度统计：`request_chars`、`response_chars`
- 内容预览必须显式开启，通过 `BRIDGE_LOG_CONTENT_MODE` 控制：
  - `none`：默认值，不记录正文预览
  - `errors-only`：仅失败请求记录脱敏后的预览
  - `full`：所有请求记录脱敏后的预览

## Guardrails

- 任何内容预览都必须先做敏感字段脱敏，再按 `BRIDGE_LOG_MAX_CONTENT_CHARS` 截断
- 流式响应只记录桥接层最终对客户端可见的聚合文本，不记录每个 SSE chunk
- 错误响应记录桥接层对外返回的稳定错误消息，不直接转储底层对象
- 默认模式不能退化成全文日志

## Implementation Notes

- 配置落点：`src/config/env.ts`
- 预览汇总与脱敏：`src/observability/log-content.ts`
- 请求级日志上下文：`src/observability/request-logging.ts`
- route 负责在请求归一化后写入 request preview，在 runtime 完成后写入 response preview
- `chat` 与 `responses` 共享同一套日志策略，避免 endpoint 之间行为漂移
