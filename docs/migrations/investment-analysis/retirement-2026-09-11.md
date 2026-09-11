# 最后文件保留与旧仓库退休 — 2026-09-11

## 可以删除什么

旧工作目录 `/Users/nicholashan/git/investment-analysis` 可以删除。当前 57 个非缓存文件（含忽略的本地配置、Obsidian 配置和临时研究输出）与 `companies/migration-backups/investment-analysis-20260908/repository/` 逐字节一致；43 个跟踪文件也已分配到当前文档或 `legacy/investment-analysis/`，源和目标哈希均通过验证。本次不代用户删除该目录。

外部 `/Users/nicholashan/Library/CloudStorage/Dropbox/Investment Archive` 必须保留：它不是旧 Git 工作目录，约 49.5 GB 档案只有部分内容保全。当前 repo 的 `companies/migration-backups/` 也须保留，里面还有未进 Git 的本地文件及已备份业务数据。应用数据适配尚未完成不妨碍删除已保全的旧代码目录。

## 仅保留最后文件

- 已移除当前仓库本地恢复包中的 `investment-analysis.bundle`，并更新保全清单。
- 保全脚本不再导出 Git 历史；只复制当前工作文件并为选定数据库生成一致性副本。
- 未将旧仓库 commit 历史合并进 contemplatio，也没有嵌套 `.git`。保留来源 commit 字符串只为标识文件出处，不包含历史对象。
- contemplatio 自身 `.git` 继续保留，用于正常分支、提交和 PR。
- 旧 SQL schema 迁移文件是最后源码的一部分，仍有恢复与解释数据库的用途，不属于 Git 历史。

## 核验

57 个源工作文件逐字节一致；151 个备份资产哈希均匹配。版本控制内的内容由 [43 个跟踪文件清单](repository-manifest.json) 和 [11 份迁移文档清单](document-manifest.json)记录。本地恢复包不随本次 push 上传，GitHub 仅保存本次提交的源码和文档。

## 提交前审查

review-agent 完整审查发现一项 P2：身份预览把两侧缺失名称视为匹配。已过滤缺失/空白名称，添加不同 ID 与同 ID 冲突两种回归场景；复查结果为 No findings。

TypeScript 检查、21 项 Node 测试和 build 通过；迁移测试 6/6、历史数据库测试 5/5 通过。40 家公司重新只读预览与原快照一致：1 家匹配、39 家待补元数据、0 冲突、39 家缺会计准则、2 家缺注册地。文档内链、目标哈希与暂存区空白检查通过。
