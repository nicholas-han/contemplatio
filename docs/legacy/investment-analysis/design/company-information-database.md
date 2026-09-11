> 历史参考：迁自 investment-analysis（b57076f，2026-09-08）。本文描述旧架构或历史试点，不替代当前架构规范，文中状态与数据截止日期保持原样。

# 个股信息存储设计：当前最小版本

## 1. 当前原则

个股目录暂时只使用两种存储：

```text
Company-Folder/
├── company.json
└── company.sqlite
```

- `company.json` 保存单值或小规模的公司基本资料；
- `company.sqlite` 当前只保存需要多行记录、唯一性约束和查询的公司名称与证券；
- 其他投研数据结构暂不设计，等逐项讨论后再添加。

## 2. `company.json`

当前字段：

| 字段 | 含义 |
|---|---|
| `incorporation_year` | 当前法律实体成立年份 |
| `inc_region` | 注册司法辖区 |
| `websites` | 公司网址列表 |
| `company_id` | 对应 `catalog.sqlite.companies.company_id` 的稳定引用 |

成立年份、注册地和网址不重复存入 SQLite。JSON 新字段必须在出现真实需求后再添加。

## 3. `company.sqlite`

当前 Schema V2 只有两张业务表：

### `company_names`

完整保存当前及历史公司名称。当前兖矿能源包含中英文 legal/common name。同一语言可以分别存在一个当前 legal name 和一个当前 common name。

### `securities`

保存该公司发行的证券。因为一个 `company.sqlite` 只对应一家公司，不再为每条记录重复保存发行人 ID。

## 4. 与 catalog 的边界

`catalog.sqlite.companies` 仍保存用于跨公司索引的默认 legal/common name、状态、分类和 `folder_name`。默认名称在公司库的完整名称表中也必须存在，校验工具会检查两边一致性。

注册地、成立年份和网址只在 `company.json` 中，不在 catalog 或公司 SQLite 中重复保存。

## 5. 历史数据

此前公司数据库中的实体、资料、关系、人物、研究条目、指标和观察值已经从正式工作库移除。它们仍完整保存在迁移前备份和原有导入材料中；未来是否恢复、如何重新设计，逐项讨论后决定。
