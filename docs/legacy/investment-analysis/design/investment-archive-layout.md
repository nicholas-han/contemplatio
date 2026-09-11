> 历史参考：迁自 investment-analysis（b57076f，2026-09-08）。本文描述旧架构或历史试点，不替代当前架构规范，文中状态与数据截止日期保持原样。

# Investment Archive 路径与目录规则

## 1. 仓库与资料库的边界

Git 仓库保存：

- 数据库 Schema；
- 通用导入、校验和生成脚本；
- 配置模板；
- 目录命名和数据规则文档。

Investment Archive 保存：

- 公司原始资料；
- 公司导入数据；
- 实际 SQLite 数据库；
- 分析员研究材料；
- 系统生成的公司视图和报告。

全局公司索引位于：

```text
Investment Archive/catalog.sqlite
```

它只保存最小公司索引和公司目录名。名称、证券及详细研究数据保存在对应公司的 `company.sqlite`。详细设计见 [全局公司索引数据库设计](company-catalog-database.md)。

任何包含真实公司资料或持续增长的数据文件，默认不放入 Git 仓库。

## 2. 本机配置

本机配置文件为：

```text
config/local.json
```

结构：

```json
{
  "version": 2,
  "investment_archive_root": "/absolute/path/to/Investment Archive"
}
```

字段含义：

| 字段 | 含义 |
|---|---|
| `version` | 配置格式版本；当前必须为 `2` |
| `investment_archive_root` | Investment Archive 在本机的绝对路径 |

`config/local.json` 必须被 Git 忽略。仓库只提交不包含真实路径的 `config/local.example.json`。

如需临时使用另一份配置，可以设置环境变量：

```bash
INVESTMENT_ANALYSIS_CONFIG=/path/to/another-config.json
```

代码必须通过 `archive_config.py` 读取路径，不能在脚本中写死某台电脑的 Dropbox 位置。

## 3. 公司文件夹命名

公司目录直接使用 catalog 中的 `common_name`，中文公司通常使用中文名称：

```text
兖矿能源
招商银行
中国平安
Robinhood
```

规则：

- 使用 catalog 的 `common_name`，不使用完整法定名称；
- 允许中文及其他 Unicode 字符；
- 不允许 `/`、`\\`、`:`、`*`、`?`、`\"`、`<`、`>`、`|` 等跨平台禁用字符；
- 默认不添加股票代码、交易所或股份类别；
- 默认不添加 `Ltd`、`Inc`、`PLC` 等法律形式，除非它是常用名称不可分割的一部分；
- 同一经济公司有多地上市证券时，仍使用一个公司目录；
- 发生更名时应单独决定是否迁移目录，不由程序自动改名。

程序验证名称是否为安全的单层目录名。命名选择仍由研究者确认。

## 4. 公司目录布局

以兖矿能源为例：

```text
Investment Archive/
├── catalog.sqlite             # 全局公司索引
└── 兖矿能源/
    ├── company.sqlite         # 兖矿能源详细数据库
    ├── _materials/              # 已有人工资料，不由本项目重排
    ├── _reports/                # 已有研报，不由本项目重排
    └── _models/                 # 已有模型，不由本项目重排
```

数据库位置规则：

- 全局数据库直接位于 Investment Archive 根目录；
- 公司数据库直接位于对应公司目录；
- 不为 SQLite 文件额外创建 `database/` 或项目专属目录；
- 整个 Investment Archive 都属于投研数据库体系，现有资料目录可以直接被数据库索引。

现有 `_materials`、`_reports` 和 `_models` 保持原状。以后系统可以为它们建立索引，但未经明确决定不移动、不改名、不自动去重。

## 5. 数据库里的文件路径

数据库只保存相对于 Investment Archive 根目录的路径，例如：

```text
兖矿能源/_materials/Periodic Reports/兖矿能源 - 2025年报.pdf
```

不保存 Dropbox 的绝对路径。运行时使用：

```text
investment_archive_root + relative_path
```

这样 Dropbox 根目录改变或另一台电脑使用不同路径时，不需要修改数据库记录。

## 6. Dropbox 与 SQLite 注意事项

Dropbox 是文件同步系统，不是数据库服务器。当前 SQLite 方案只适用于单人、单机写入：

- 同一时间只允许一台电脑或一个写入进程打开数据库；
- 切换电脑前必须关闭数据库并等待 Dropbox 完成同步；
- 不在多台机器上同时编辑同一个 `company.sqlite`；
- 当前使用 SQLite `DELETE` journal，不使用需要额外同步旁路文件的 WAL 模式；
- 导入数据和原始资料可以帮助重建数据库，但仍应保留独立备份。

当出现并发写入、远程服务或多用户需求时，应迁移到正式数据库服务，而不是依赖 Dropbox 同步 SQLite。
