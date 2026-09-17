# Contemplatio: Equity Research

Local-first, company-centric equity research for DeepSeek Harness / Cordis. The current implementation covers the v0.1 bootstrap slice: portable company workspaces, manifest validation, SQLite migrations, retained artifacts, SHA-256 integrity, provenance tables, reusable metric packs, point-in-time estimates, management history, cap table snapshots, valuation models, and a local inspection UI.

Research principles and requirements are maintained in [research principles](docs/principles/README.md) and [business requirements](docs/requirements/README.md). The current implementation and its contracts are defined by the v0.1 architecture and the operating guide.

## 文档与开发入口

- [文档总目录](docs/README.md)：研究原则、需求、架构与操作。
- [开发与操作指南](docs/guides/operations.md)：环境配置、建档、导入、审核、导出和本地界面。
- [架构规范](docs/architecture/v0.1.zh.md)：当前数据模型、边界和运行时契约。

```sh
npm install
npm run check
npm test
npm run build
```

仓库名称为 `contemplatio`；npm 包 `@conte/equity-research`、Cordis 插件 ID 和 `CONTE_EQUITY_ARCHIVE` 保持现有接口名称。
