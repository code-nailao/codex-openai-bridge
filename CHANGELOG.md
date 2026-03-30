# CHANGELOG

本项目采用 [Semantic Versioning](https://semver.org/) 管理版本。

## [0.1.0] - 2026-03-30

### Added

- 新增根级 [`README.md`](./README.md)，明确项目定位、v1 边界、非目标、运行与安全约束，以及面向使用者与贡献者的双受众首页结构
- 新增根级 [`AGENTS.md`](./AGENTS.md)，固化长期维护约束、TODO 双轨制、git 纪律、文档同步规则与安全红线
- 新增 [`docs/development.md`](./docs/development.md)，定义 v1 scaffold 之前的工程基线、目录职责、配置策略、日志原则、错误映射原则与测试门槛
- 新增 [`docs/roadmap.md`](./docs/roadmap.md)，将 Bootstrap、V1、Next 三层 roadmap 与详细 TODO 落盘
- 新增 [`VERSION`](./VERSION) 作为当前版本基线

### Governance

- 将仓库当前阶段定义为 `Documentation Bootstrap`
- 锁定 v1 目标接口：`POST /v1/chat/completions`、`POST /v1/responses`、`GET /v1/models`、`GET /healthz`
- 锁定默认安全策略：`127.0.0.1`、bearer auth、`read-only`、`approval=never`
- 锁定 v1 非目标：multimodal、tools、strict JSON schema、WebSocket、远端多租户鉴权、直接连中转站 REST
