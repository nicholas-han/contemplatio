# Contemplatio: Equity Research

Local-first, company-centric equity research for DeepSeek Harness / Cordis. The current implementation covers the v0.1 bootstrap slice: portable company workspaces, manifest validation, SQLite migrations, retained artifacts, SHA-256 integrity, provenance tables, reusable metric packs, point-in-time estimates, management history, cap table snapshots, valuation models, and a local inspection UI.

Research knowledge and requirements migrated from the earlier repository are indexed in [research principles](docs/principles/README.md) and [business requirements](docs/requirements/README.md). See the [investment-analysis migration log](docs/migrations/investment-analysis/README.md) for preservation scope, identity previews, and remaining work; archived designs do not replace the current v0.1 architecture.


旧仓库清理范围见[最后文件保留记录](docs/migrations/investment-analysis/retirement-2026-09-11.md)。

## 文档与开发入口

- [文档总目录](docs/README.md)：研究原则、需求、架构、操作与历史资料。
- [开发与操作指南](docs/guides/operations.md)：环境配置、建档、导入、审核、导出和本地界面。
- [本次仓库整合记录](docs/migrations/investment-analysis/consolidation-2026-09-10.md)：保留内容、完整性核验与删除边界。

```sh
npm install
npm run check
npm test
npm run build
```

仓库名称为 `contemplatio`；npm 包 `@conte/equity-research`、Cordis 插件 ID 和 `CONTE_EQUITY_ARCHIVE` 保持现有接口名称。
