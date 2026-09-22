# 微博语义过滤 Chrome 扩展

当前版本 **0.3.3**。个人 Chrome Manifest V3 扩展，运行于微博原网页；默认观察 Shadow，可切换自动 Active。四个目标账号之外的可识别微博默认直接折叠，Shadow 下也生效；支持四账号的体育、指定人物和可选纯图片规则，以及但斌的纯互动、王文的哲理/诗词过滤。

[安装、配置、规则、反馈与更新指南](../../docs/guides/weibo-extension.md)是用户操作的统一入口。反馈会本地保存并立即改变当前展示，不会自动训练模型或修改长期规则。

## 安装交付

- `dist/`：可直接「加载已解压的扩展程序」的目录。
- `artifacts/weibo-semantic-filter-0.3.3.zip`：同版本安装包。
- 更新构建后，在 Chrome 扩展管理页重新加载，再刷新微博；无需重填 key。
- 正常使用无需 Node、SQLite、浏览器桥或定时任务。API key 只保存在浏览器扩展可信上下文，源码与安装包不包含个人 key。

## 构建与测试

在本目录运行，Node.js 22 或以上：

```sh
npm ci
npm run check
npm test
npm run build
npm run package
```

`package` 会执行类型检查、单元/集成测试、构建和 ZIP 打包；浏览器回归单独运行。从仓库根目录可用 `npm run weibo:check`、`weibo:test`、`weibo:build`、`weibo:package` 等同名快捷命令。

独立 Chrome 回归：

```sh
npx playwright install chromium
npm run test:browser
```

本机已下载的官方 Chrome for Testing 可重复使用：

```sh
WSF_TEST_CHROME="$PWD/.local/chrome-test/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" npm run test:browser
```

测试创建临时 profile，加载真实扩展并使用模拟微博页面，不使用用户登录态和真实模型 key。运行需要允许启动浏览器；报告和截图写入 `artifacts/`。`.local/chrome-test/` 是可复用测试运行时，保留它可避免重复下载。

`tests/fixtures/desktop-2026-09-21.json` 保存 30 条匿名化真实 DOM fixture；姓名、正文、UID、链接和媒体地址已替换，只用于 DOM 回归，不是效果评估集。早期一次性 Phase 0 探针和采集脚本已清理。

`scripts/bridge.mjs` 是可选的真实页面维护工具，依赖开发者本机 Kimi WebBridge；不参与正常使用、构建或自动测试。不要把它误认为插件后台服务。

## 人工效果评估

提前在设置中开启可见原文采样，使用「应保留／应折叠」标注并导出，然后运行：

```sh
npm run evaluate -- /absolute/path/to/weibo-feedback.json
```

报告包含误折叠率、精确率、召回和延迟；缺样本不能宣称达标。当前评估门槛要求至少 100 条、三个会话、单一配置和至多一个实际模型，应对文字/图片分别评估。脚本不会自动修改设置或启用 Active，实际费用查服务商账单。

当前验证为 38 项自动测试、14 项独立 Chrome 检查，且用户 Jev 连通及真实页面标签已验证。图片真实效果、完整中文标注集和一周试用仍待验收。

需求与实现契约见 [PRD](../../docs/requirements/PRD_Weibo_Semantic_Filter_Chrome_Extension_MVP_v0.2.md) 和[架构](../../docs/architecture/weibo-semantic-filter-mvp.md)。
