# 旧微博试点退役与目录清理

日期：2026-09-21。用户已将微博功能改为原网页 Chrome 扩展，并授权清理无用内容、更新文档。当前交付为扩展 0.3.1；根目录公司研究系统继续保留。

## 实际部署核对与停用

清理前核实 `gui/501/com.contemplatio.weibo` 正在运行，工作目录为本仓库，启动命令为 `npm run weibo:daemon`，对应 Node 子进程运行 `scripts/weibo-daemon.ts`。未发现独立阅读器或其他微博抓取进程。

已执行该任务的 `launchctl bootout`，等待退出后确认服务不再注册、相关进程消失；已移除 `~/Library/LaunchAgents/com.contemplatio.weibo.plist`，避免下次登录重启。其他 launchd 任务和浏览器桥服务未改动。

## 移除内容

- `src/weibo/`：旧抓取数据源、SQLite、规则、分类器、独立 Web 阅读器及调度配置，共 9 个文件。
- 六个旧运行脚本：`scripts/weibo-fetch.ts`、`weibo-daemon.ts`、`weibo-reprocess.ts`、`weibo-schedule.ts`、`start-weibo-web.ts`、`install-weibo-launchd.sh`。
- 旧 `tests/weibo.test.ts` 与 `ops/com.contemplatio.weibo.plist`。
- 被替代的独立阅读器需求 `docs/requirements/curated-weibo-feed-mvp.md` 和指南 `docs/guides/weibo-mvp.md`。
- 扩展早期 `scripts/probe.ts`、`capture-fixtures.js`、`phase0-capture.mjs`，及 `.local/` 内相应临时 JS、重复采集 JSON。
- 0.2.0、0.2.1、0.3.0 旧 ZIP 和目录中的 `.DS_Store`；保留最新安装包。
- 根 `dist/` 旧构建输出清理后按现存源码重建，避免废弃文件残留。

根 package 的六个旧 `weibo:*` 命令已移除，替换为扩展 `check/test/build/package/evaluate/test:browser` 快捷入口。扩展源码行为本次未改动，版本仍为 0.3.1。

## 保留内容与恢复

- `.data/weibo.sqlite`：旧抓取数据，未删除、未迁移；Chrome 扩展不读取它。
- `companies/`、外部公司档案、根公司研究代码、迁移脚本、测试和 `.env`：仍有独立用途，保留。
- 扩展 `dist/`、0.3.1 ZIP、源码、测试、30 条匿名 DOM fixture、最新浏览器验证报告与截图：当前交付或回归证据。
- `.local/chrome-test/`：仍用于真实 Chrome 回归；开发依赖亦保留。
- 浏览器内已保存的 API key、设置、反馈、缓存：此次清理未访问或修改。

旧代码多数尚未提交，因此删除前创建并逐文件核对了恢复备份：

- `.data/retired/weibo-pilot-2026-09-21.tar.gz`：22 个移除文件及 8 个修改前的文档/入口，共 30 个文件。
- `.data/retired/weibo-pilot-2026-09-21.sha256.json`：备份文件的 SHA-256 清单。
- `.data/retired/com.contemplatio.weibo.plist`：当时实际安装的 launchd 配置，删除安装副本前确认字节一致。

这些文件被 Git 忽略。需要追溯时，将压缩包解到新的临时目录核对，不要直接覆盖当前工程，也不要为了查历史数据重新启用抓取任务。备份不含 `.env`、浏览器密钥或数据库副本；原数据库仍在原处。

## 文档更新

根 README、文档目录和需求索引区分公司研究与扩展。扩展指南、架构和 PRD 统一到当前规则、看图授权、Vercel 配置及反馈机制；保留原 PRD 文件名以兼容已有引用，明确它已包含用户后续补充。清除与现状矛盾的“未安装/未连通”“两账号全部保留”“Shadow 反馈不改变展示”等旧描述。

## 清理后验证

- 公司研究：类型检查、重新构建、21 项测试通过。Web 测试需本机监听权限；获准在沙箱外执行后通过。
- 微博扩展：通过新根命令完成类型检查、28 项测试、构建及 10 项独立 Chrome 检查。
- 17 份 Markdown 的本地链接检查无断链。
- 0.3.1 ZIP 与构建目录逐文件字节一致；根构建输出无旧微博模块。
- 旧数据库只读 `quick_check` 为 `ok`，保留 845 条微博记录。
- 恢复压缩包内 30 个文件的 SHA-256 与清单全部一致。
