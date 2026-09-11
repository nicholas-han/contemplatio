# 全局公司索引库

全局索引只回答公司是谁、当前分类是什么、公司资料目录在哪里。多语言名称、证券和详细研究信息进入各公司的 `company.sqlite`。

## 位置

```text
Investment Archive/catalog.sqlite
```

实际路径通过已被 Git 忽略的 `config/local.json` 解析。

## 唯一业务表

- `companies`

完整字段和约束见 [`schema.sql`](schema.sql)。设计理由见 [全局公司索引设计](../../../../docs/legacy/investment-analysis/design/company-catalog-database.md)。

当前 Schema 版本为 `8`。`folder_name` 原则上等于 `common_name`，允许中文；`company.json.company_id` 用于反向引用 catalog。成立年份、注册地和网址等公司资料进入公司目录下的 `company.json`。

`companies.gics_sub_industry_code` 只保存 8 位 GICS Sub-Industry ID。行业名称、定义和上级层级不在 catalog 重复保存，统一以 `Investment Archive/_GICS_by_MSCI/gics_structure.json` 为字典；`validate` 会检查所有已填写 ID 是否真实存在于该字典。

## 命令

```bash
python3 research/catalog/catalog.py init
python3 research/catalog/catalog.py migrate
python3 research/catalog/catalog.py validate
python3 research/catalog/catalog.py list
python3 research/catalog/catalog.py show 100000
```

`init` 用于创建新库；`migrate` 用于把已有库升级到当前 Schema，并在迁移前自动创建完整备份。
