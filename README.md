# Contemplatio

这个仓库包含两个独立工程：公司研究系统，以及在微博原网页上过滤内容的个人 Chrome 扩展。

| 工程 | 目录 | 使用入口 |
| --- | --- | --- |
| 公司研究系统 | 根目录 `src/`、`scripts/`、`tests/` | [开发与操作](docs/guides/operations.md) |
| 微博语义过滤 Chrome 扩展 | `extensions/weibo-semantic-filter/` | [安装、规则与反馈](docs/guides/weibo-extension.md) |

公司研究系统是面向 DeepSeek Harness / Cordis 的本地公司档案工具，提供 SQLite、证据与来源、行业指标包、历史估计、管理层与股本记录、估值模型和本地工作台。现行架构为 v0.1。

微博功能当前交付为 **0.3.3 Chrome 插件**，支持四账号通用过滤、账号策略、Shadow / Active 和本地纠错。旧抓取服务、独立阅读器与定时任务已退役，见[清理记录](docs/migrations/weibo-pilot/retirement-2026-09-21.md)。

## 开发

公司研究系统：

```sh
npm ci
npm run check
npm test
npm run build
```

微博扩展（依赖独立安装）：

```sh
npm --prefix extensions/weibo-semantic-filter ci
npm run weibo:check
npm run weibo:test
npm run weibo:build
npm run weibo:package
```

根目录的 `check/test/build` 仅覆盖公司研究系统；`weibo:*` 快捷命令只操作扩展。安装目录为 `extensions/weibo-semantic-filter/dist/`，构建后需在 Chrome 重新加载并刷新微博。

## 文档

- [文档总目录](docs/README.md)
- [公司研究架构](docs/architecture/v0.1.zh.md)
- [微博扩展架构](docs/architecture/weibo-semantic-filter-mvp.md)
- [投资原则](docs/principles/README.md)与[业务需求](docs/requirements/README.md)

仓库名为 `contemplatio`；npm 包 `@conte/equity-research`、Cordis 插件 ID 与 `CONTE_EQUITY_ARCHIVE` 保持原接口名称。公司资料、历史微博数据库、密钥与本地恢复备份不进 Git。
