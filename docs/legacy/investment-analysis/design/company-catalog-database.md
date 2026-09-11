> 历史参考：迁自 investment-analysis（b57076f，2026-09-08）。本文描述旧架构或历史试点，不替代当前架构规范，文中状态与数据截止日期保持原样。

# 全局公司索引数据库设计 V8

## 1. 定位

`Investment Archive/catalog.sqlite` 是所有公司研究档案的最小入口，只回答：

1. 系统中有哪些公司；
2. 一家公司的默认名称和当前分类是什么；
3. 该公司的资料目录叫什么。

它不再保存多语言名称、证券、财务、经营、人物、事件、资料内容或研究判断。这些信息属于各公司的 `company.sqlite`。

```text
Investment Archive/
├── catalog.sqlite
└── 兖矿能源/
    └── company.sqlite
```

## 2. 唯一业务表：`companies`

| 字段 | 必填 | 含义 |
|---|---:|---|
| `company_id` | 是 | 系统生成的六位永久整数 ID |
| `legal_name` | 否 | 当前默认法定名称 |
| `legal_name_language` | 条件必填 | 法定名称的 BCP 47 风格语言标签 |
| `common_name` | 是 | 默认展示和日常研究使用的名称 |
| `common_name_language` | 是 | 常用名称的 BCP 47 风格语言标签 |
| `status` | 是 | 公司法律或存续状态 |
| `gics_sub_industry_code` | 否 | 当前 GICS 八位 Sub-Industry Code |
| `custom_industry_id` | 否 | 自定义精简行业分类 ID |
| `folder_name` | 是 | Investment Archive 下的公司目录名 |

`company_id` 范围为 `100000` 至 `999999`，不编码公司、市场或语言等业务含义，删除后不复用。

`folder_name` 唯一，原则上直接使用 `common_name`，例如 `兖矿能源`。允许中文和其他 Unicode 字符，但不能包含跨平台文件名禁用字符。公司数据库位置可直接推导为：

```text
Investment Archive / folder_name / company.sqlite
```

因此不再单独保存 archive 表或可推导路径。

## 3. 信息归属边界

下列内容进入对应公司的 `company.sqlite`：

- 完整的多语言、历史、法定及常用名称；catalog 的默认 legal/common name 必须在这里存在对应的当前名称记录；
- 公司发行的证券；
- 公司及相关实体；
- 原始资料索引；
- 财务和经营数据；
- 人物、关系、事件与研究内容。

成立年份、注册地和网址等公司资料进入公司目录下的独立 `company.json`，不存入 SQL。GICS 和自定义行业 ID 留在 catalog，是因为它们用于跨公司筛选和索引。详细行业研究仍进入公司库或研究文档。

## 4. 版本与维护

- 当前 Schema 版本为 SQLite `PRAGMA user_version = 8`；
- catalog 必须只有 `companies` 一张业务表；
- Schema 和迁移脚本位于 Git 仓库；
- 实际数据库位于 Investment Archive，不进入 Git；
- Schema 改变通过版本化迁移完成，不删除数据库重建；
- `company_id` 一旦建立，原则上永久不变。
