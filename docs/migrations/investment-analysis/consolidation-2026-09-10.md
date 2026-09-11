# 仓库整合记录 — 2026-09-10

> 历史快照：旧工作目录删除条件与 Git 历史保留策略已由 [2026-09-11 记录](retirement-2026-09-11.md)更新。下文描述当时状态。

## 名称与位置

本地仓库已位于 `/Users/nicholashan/git/contemplatio`；旧任务路径 `/Users/nicholashan/git/_conte/conte-equity-research` 不再存在。GitHub 新地址经 `git ls-remote` 验证可访问，origin 更新为 `https://github.com/nicholas-han/contemplatio.git`。目录名称、远程仓库名与 npm/Cordis 标识是不同层次，此次保留现有包名、插件 ID 和环境变量，避免破坏调用方。

## 内容保留结论

| 资产 | 处理与理由 |
|---|---|
| 两份投资理念/方法论 | `docs/principles/`：研究问题、反证、输出物的长期基础；个人仓位和杠杆观点保留为原文 |
| 两份业务需求 | `docs/requirements/`：公司研究覆盖、事实/假设/判断边界；仍是长期需求 |
| 七份旧设计/宇树试点 | `docs/legacy/investment-analysis/design/`：保留来源版本、证据和冲突语义；当前架构继续采用 TypeScript/Cordis |
| Python、SQL、迁移链、种子数据、配置样例及旧操作说明 | `legacy/investment-analysis/`：32 个文件供恢复和参考，未接入当前运行时 |
| 旧 Git 历史与工作区本地文件 | 本地恢复包保留，包含本地配置、Obsidian 偏好和临时研究输出；不把个人配置混入源码 |
| 40 家公司身份、宇树证据、旧数据库 | 既有恢复包保存选定资产；应用中的结构化接入仍未完成 |

[源仓库清单](repository-manifest.json)为全部 43 个跟踪文件记录目标、源哈希和目标哈希；其中 11 份文档在正式文档体系维护，其余 32 份为历史源码。历史源码 README 的相对链接已适配新位置，完整原文仍在恢复包。

最值得延续的设计是：原始来源候选与现值分开、多来源冲突不能被覆盖、保留范围/单位/时间语义、研究问题与覆盖缺口可追踪。详见[候选层提案](candidate-layer-proposal.md)；这些需要后续领域实现，本次目录整理不将其标记为已交付。

## 恢复与删除边界

恢复包：`companies/migration-backups/investment-analysis-20260908/`（Git 忽略）。本次重新核验全部 151 个保全文件 SHA-256，均匹配；旧仓库当前非缓存工作文件与保存副本逐字节一致。Git bundle 另行验证并恢复检查。

删除 `/Users/nicholashan/git/investment-analysis` 工作目录与删除外部 `Investment Archive` 是两件事：工作目录的有价值内容已有去向；外部约 49.5 GB 档案只有部分内容备份，其余仍依赖原外部目录。此次没有删除旧仓库、外部档案或远端仓库，也未 commit/push。恢复包在当前电脑且不进 Git，不能当作 GitHub 已保存的副本。

39 家公司缺明确会计准则，部分注册地缺口仍待核实；宇树候选观测未转换为现行 facts。保全完成不代表这些业务迁移完成。

## 文档检查与归档

将散落的两份架构规范移入 `docs/architecture/`，研究 charter 移入 `docs/principles/`，早期档案盘点和迁移评估分别归入对应迁移目录。根 README 的完整操作内容移入 `docs/guides/operations.md`。所有 Markdown 按用途登记，并修复内部文件链接；旧历史报告保留原日期和当时状态，由本记录提供当前进展。

本次检查针对文档用途、状态、重复入口、相对路径与资产完整性；未对研究理念中的引言、历史金融数字做外部事实核查，也未重新审计约 49.5 GB 外部档案。

[文档迁移前后清单](documentation-inventory.json)记录整理前后的路径和内容哈希。

## 本次验证结果

- 旧仓库全部 43 个跟踪文件均有归档目标，源与目标哈希清单校验通过。
- 既有恢复包 151 个文件哈希均一致；旧仓库非缓存工作文件与保全副本一致。
- Git bundle 验证通过，恢复到临时 bare 仓库后 43 个文件与当前旧仓库逐字节一致。
- Markdown 内部文件链接核验通过；迁移工具既有离线测试 4/4 通过；`git diff --check` 通过。
- 本次没有改变 TypeScript 运行时代码，未重新运行 Node 全套测试。
