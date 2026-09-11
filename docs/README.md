# Contemplatio 文档总目录

按文档用途归档。现行系统以架构规范及实现为准；长期业务需求和历史试点不能视作已经交付的功能。

| 目录 | 内容与入口 | 状态 |
|---|---|---|
| `principles/` | [投资理念与方法](principles/README.md) | 个人研究原则，非程序默认投资规则 |
| `requirements/` | [业务需求](requirements/README.md) | 长期需求基线，包含未实现范围 |
| `architecture/` | [中文 v0.1](architecture/v0.1.zh.md)、[English v0.1](architecture/v0.1.md) | 当前架构基线，两种语言同步维护 |
| `guides/` | [开发与操作](guides/operations.md) | 当前命令、配置与工作流 |
| `migrations/` | [旧仓库迁移](migrations/investment-analysis/README.md)、[早期档案盘点](migrations/equity-archive/inventory-2026-08-30.md) | 有日期的执行记录、清单与未实施提案 |
| `legacy/` | [旧设计与宇树试点](legacy/investment-analysis/README.md) | 历史参考，不能用作现行 schema |

## 归档规则

- 根 README 只保留项目简介和入口；详细操作放 `guides/`。
- 研究理念放 `principles/`，要解决的业务问题放 `requirements/`，实现契约放 `architecture/`。
- 日期明确的盘点、迁移评估和验收记录放对应 `migrations/<来源>/`；提案须注明尚未实施。
- 被取代的规范放 `legacy/<来源>/`，维持历史语境；旧代码与 SQL 随源码保存在仓库根的 `legacy/`，相关 README 与代码就近存放。
- 同一正文只有一个维护位置，用相对链接引用。迁移清单记录源路径和 SHA-256；恢复备份保持原始内容，不作为第二套现行文档。
- 新文件使用小写连字符命名；语言版本使用 `.zh.md`；审计快照使用 `YYYY-MM-DD`。历史来源文件名保留以便追溯。
- 公司原始材料、数据库、模型文件和研究输出按公司保存在外部 archive 的 company workspace；`companies/` 中的本地备份不进 Git，也不归入系统说明文档。

本次逐文件归档与核验见[整合记录](migrations/investment-analysis/consolidation-2026-09-10.md)。
