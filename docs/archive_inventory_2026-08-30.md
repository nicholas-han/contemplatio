# Equity Research Archive Inventory

盘点日期：2026-08-30  
盘点方式：只读文件系统、SQLite schema 和 CSV metadata 检查  
盘点范围：`/Users/nicholashan/Library/CloudStorage/Dropbox/Equity Research Archive`

本次盘点没有移动、重命名、删除或改写 Dropbox 中的任何文件。

## 总览

当前 archive root 下只有一个公司目录：`Yankuang-Energy/`。

- 总占用约 242 MB
- 非系统文件 102 个，另有 7 个 `.DS_Store`
- 75 个 PDF
- 13 个 DOCX、1 个 DOC
- 2 个 XLSX
- 1 个 CSV、1 个 SQL
- 2 个 JSON、2 个 SQLite
- 5 个 Markdown

公司目录目前混合了四类内容：

```text
_materials/   年报、业绩会、股东会、M&A 材料
_reports/     外部评级报告和分析师研报
_models/      Excel 模型
_research/    旧系统的数据库、导入文件、来源和分析输出
根目录文件    company.json、company.md、SQLite 备份
```

## 旧系统结构

根目录的 `company.json` 使用旧格式：

- `schema_version` 是数字 `1`，不是当前 manifest 的字符串 `"0.1"`
- `company_id` 是数字 `100000`，不是当前要求的 slug
- 公司名称、证券信息没有按当前 manifest 结构保存
- website 使用 `websites[]` 数组

根目录 `company.sqlite` 的实际业务表只有：

- `company_names`：5 行，包含当前名称和历史名称“兖州煤业股份有限公司”
- `securities`：2 行，分别为 HKEX `01171` 和 SSE `600188`

该 SQLite 的 `user_version` 为 2，不是本项目的 migration schema。当前本项目的 migration 表和 `facts`、`sources`、`evidence` 等表都不存在。

`_research/imports/seed.sql` 试图写入 `entities`、`documents`、`entity_relationships`、`persons`、`positions`、`metric_definitions`、`research_items` 等表，但这些表不在当前 live SQLite 中。因此不能直接对现有 `company.sqlite` 执行该 SQL；它应被视为旧系统的重建输入或历史记录。

## 旧 observation CSV

文件：`_research/imports/observations.csv`

- 98 条 observation 数据行（文件末尾另有一个空行）
- 44 个不同的旧 metric id
- 72 条 `needs_primary_source`
- 13 条 `needs_recalculation`
- 12 条 `needs_definition_check`
- 1 条 `needs_metric_definition`
- 1 条 review status 为空

来源分布：

- `src-legacy-master-note-v1`：39 条
- `src-meeting-2026-06-25`：25 条
- `src-meeting-2025-04-27`：15 条
- `src-meeting-2025-05-29`：13 条
- `src-meeting-2025-06-05`：6 条

这些 observation 很有迁移价值，但不能批量直接标记为 authoritative fact。它们包含旧综合笔记、管理层转述、分析员计算和待确认口径，导入时需要保留原始 `value_nature`、`review_status`、`source_locator` 和 `notes`。

## 迁移判定

### 可以直接作为 retained artifacts 保留

- 年报、季报、业绩会材料、股东会材料
- 评级报告和分析师研报
- M&A 文件
- Excel 模型
- 原始 Markdown 笔记
- 原始 CSV、SQL 和旧 SQLite 备份

这些文件进入新 workspace 的 `documents/`，每个 artifact 计算 SHA-256。原始文件不覆盖，文件名和相对来源路径记录在 provenance metadata 中。

### 需要转换后再进入结构化表

- 旧 `company.json`：映射为当前 manifest，并保留历史 JSON 为 artifact
- `company_names`、`securities`：映射到当前 Company manifest
- `observations.csv`：先映射旧 metric 到 Metric Definition，再根据 period、value type 和 dimensions 写入 facts
- 旧 SQL 中的 entities、relationships、positions：需要等 Corporate/Management schema 实现后再导入

### 默认隔离，不自动写入 authoritative tables

- `legacy_compilation`
- `analyst_statement`
- `analyst_calculation`
- `management_statement`
- 状态为 `needs_primary_source`、`needs_definition_check` 或 `needs_recalculation` 的记录

这类记录可以作为待审阅 observations 或 staging rows 保存，但必须保留其不确定性。

## 推荐下一步

1. 新建只读 importer inventory，先输出 manifest、artifact、旧 observation 的审计报告。
2. 建立旧 metric id 到当前 Metric Pack 的显式映射表；没有映射的 metric 不自动创建。
3. 在 archive root 下使用独立 staging 目录，例如 `.conte-staging/`，不要覆盖现有 `Yankuang-Energy/`。
4. 先复制文件并计算 hash，再导入 metadata；结构化 facts 采用 dry-run 和人工抽查。
5. 对已核验的 observation 单独执行 promote，不能因为迁移完成就改变 review status。

在 importer 和 staging 验证完成前，不应运行会写入现有 `Yankuang-Energy/` 的 seed 或 migration 命令。
