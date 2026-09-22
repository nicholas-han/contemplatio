# Contemplatio 文档总目录

公司研究系统与微博 Chrome 扩展独立维护。需求描述不等于已验收；当前行为以各工程的架构、使用指南和实现为准。

| 工程 | 需求 | 架构 | 操作 |
| --- | --- | --- | --- |
| 公司研究 v0.1 | [公司信息框架](requirements/company-research.md)、[研究系统](requirements/research-system.md) | [中文](architecture/v0.1.zh.md)、[English](architecture/v0.1.md) | [开发与操作](guides/operations.md) |
| 微博扩展 0.3.3 | [PRD v0.2 与已确认补充](requirements/PRD_Weibo_Semantic_Filter_Chrome_Extension_MVP_v0.2.md) | [扩展架构](architecture/weibo-semantic-filter-mvp.md) | [安装、规则、反馈与更新](guides/weibo-extension.md) |

其他入口：

- [投资理念与方法](principles/README.md)：个人研究原则，非程序默认投资规则。
- [需求索引](requirements/README.md)：业务需求及工程边界。
- [外部档案盘点](migrations/equity-archive/inventory-2026-08-30.md)：历史迁移记录。
- [旧微博试点退役记录](migrations/weibo-pilot/retirement-2026-09-21.md)：已移除内容、停用任务、保留数据与恢复备份。

## 维护约定

- 根 README 保留项目简介和入口，详细操作放 `guides/`；需求、架构与验证结果明确区分。
- 当前契约同步更新，不保留与实现相矛盾的旧操作步骤。被替代的运行方案退出现行文档，迁移事实记入 `migrations/`。
- 同一正文尽量只有一个维护位置；两种语言的公司研究架构同步维护。
- 新文件使用小写连字符命名，语言版本用 `.zh.md`。用户引用过的历史来源文件名可保留，并注明当前修订范围。
- 公司原始材料、数据库、密钥和恢复备份不归入现行系统文档；`companies/`、`.data/`、`.env` 不进 Git。
