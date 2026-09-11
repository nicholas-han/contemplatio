# investment-analysis 迁移评估

> 历史快照：旧工作目录删除条件与 Git 历史保留策略已由 [2026-09-11 记录](retirement-2026-09-11.md)更新。下文描述当时状态。

评估日期：2026-09-08。旧仓库：`/Users/nicholashan/git/_conte/investment-analysis`，HEAD：`b57076f`。本轮为只读盘点；没有迁移业务数据、运行旧迁移脚本或删除旧文件。本报告新增于当前仓库。

## 1. 结论

旧仓库有 43 个 Git 跟踪文件，主要是研究哲学/方法论、业务需求、数据库设计、Python/SQLite 管理工具及宇树试点。没有独立 Web 应用或可直接接入当前 Model Engine 的成熟估值模块。

值得保留的核心资产：研究框架、真实公司身份资料、宇树原始材料与证据，以及多来源候选、冲突、覆盖缺口等数据语义。当前 TypeScript/Cordis 架构继续作为主实现；旧 Python 工具用于迁移参考和恢复，不整套并入运行时。

## 2. 实测资产与验证

- 旧仓库工作区无已跟踪文件改动；有 2 个 Git 提交。
- `python3 -B -m unittest -v research.database.test_company_database`：5/5 通过，测试仅使用临时数据库。
- `config/local.json` 指向外部 `/Users/nicholashan/Library/CloudStorage/Dropbox/Investment Archive`，业务数据不在 Git 中。
- 以 SQLite `mode=ro` 查询：catalog V8，共 40 家公司，公司数据库全部存在；39 家 V2、1 家 V4（宇树）。V2 主要为名称及证券资料，不代表完成公司研究。
- 宇树：5 个实体、5 份文档、7 个文档文件、47 条观测值、67 条证据链接、1 个质量问题、1 个研究问题、2 个覆盖范围。
- 宇树数据库 `integrity_check` 为 `ok`；7 个登记文件逐一检查存在性、大小、SHA-256，全部匹配。
- 宇树有 10 个双来源序列，其中 9 个存在冲突。此处仅核验本地数据库状态，不重新核实披露内容的真实性或时效性。
- 外部 GICS 字典 `_GICS_by_MSCI/gics_structure.json` 存在；未进行全档案文件哈希审计、全部公司字段对账或当前 staging 去重。

## 3. 逐组迁移清单

| 旧路径 | 价值及处理建议 | 当前 repo 的建议落点 |
|---|---|---|
| `knowledge/charter/investment-philosophy.md` | 原文保留，属于个人研究原则；引用和经验性数字未重新核实 | `knowledge/charter/`，标注历史来源 |
| `knowledge/charter/investment-methodology.md` | 原文保留；提炼研究流程、输出物和证伪问题；仓位/杠杆等个人观点不要直接变成程序默认规则 | `knowledge/charter/`；后续研究流程需求 |
| `docs/brd/company.md` | 高价值，公司研究信息覆盖框架比当前数据 MVP 更广 | `docs/requirements/`，整理为覆盖清单 |
| `docs/brd/research-system.md` | 高价值，区分事实、推断、假设、判断和未知项 | `docs/requirements/`，区分当前范围和远期需求 |
| `docs/design/company-research-data-model.md` | 提炼双时间、冲突、单位、范围值、覆盖与血缘；不整体替代当前架构 | 新的设计决策与待办；原文放历史参考 |
| `docs/design/unitree-company-data-example.md` | 有用的业务样例，部分内容为拟议模型，不能全部视为已入库数据 | `docs/examples/` 或历史参考 |
| `docs/design/unitree-phase-a-implementation.md`、`unitree-2024-version-pilot.md` | 保留试点基线、证据边界及验收结果 | `docs/migrations/` 或历史参考 |
| `docs/design/company-catalog-database.md`、`company-information-database.md`、`investment-archive-layout.md` | 老架构说明，与当前 ID、manifest、目录规则不同；保留映射信息后归档 | 迁移设计附录；不作为现行规范 |
| `research/catalog/catalog.py`、`schema.sql`、`migrations/001…007` | catalog 查询、校验、备份思路可复用；旧迁移链作为恢复资料保留 | 新 importer 读取旧库；旧代码封存 |
| `research/database/company_database.py`、`schema.sql`、`migrations/001…004` | V2/V4 结构和验证规则有价值；不直接对新库执行 SQL | 数据适配器、领域校验与测试用例 |
| `research/database/test_company_database.py` | 保留测试意图：迁移不丢名称证券、证据哈希、确认事实需证据、多来源冲突 | 将适用场景移植到 TypeScript 测试 |
| `research/database/seed_unitree_phase_a.py`、`seed_unitree_2024_version_pilot.py`、`manifests/unitree.json` | 高价值，可复现来源定位和试点数据；依赖旧 schema 及外部文件 | 原文封存；迁移后生成符合新结构的 fixture |
| `research/database/proposals/`（README 和两个 SQL） | 未正式落地的设计与 fixture；不能当现有功能或正式迁移执行 | 历史设计参考，按需提炼风险/假设/血缘 |
| `research/database/add_companies.py` | 公司名称/证券导入逻辑可作映射参考；新 repo 已有建档功能 | 新 importer；旧实现不进入运行时 |
| `research/database/archive_config.py`、`config/local.example.json` | 配置与路径校验已有新实现；旧配置仅用于定位源档案 | 迁移工具支持显式源路径 |
| `research/database/setup_company_archive.py` | 旧目录初始化，已被当前公司建档覆盖 | 依赖切断后淘汰 |
| `research/database/sync_company_identity.py` | 针对旧 catalog/中文目录的专用同步脚本，含改名写入操作 | 仅作恢复参考，迁移后淘汰 |
| `research/database/build_database.py` | 历史 CSV 构建器，字段与现行旧库不同；旧 README 已明确不用于覆盖正式库 | 提炼必要字段语义后淘汰 |
| 根 `README.md`、`.gitignore`、两个子目录 README | 不需要替代当前说明；保留旧操作说明随恢复包归档 | 历史归档 |
| 外部 `catalog.sqlite`、40 家公司 `company.json/company.sqlite` | 真实数据优先保留；需与当前 staging 对账合并 | 配置的公司档案目录，而非源码 Git |
| 外部公司原始文件、GICS 字典 | 原始证据及分类资产必须独立盘点保存；GICS 不替代投资者自定义业务分类 | 外部档案和可选分类映射 |

## 4. 必须解决的语义差异

1. **公司 ID 和 manifest**：旧 catalog 是整数 ID、中文目录；当前要求 slug ID，且要求 jurisdiction/accounting_standard。必须建立显式 ID 对照并处理缺失必填项，不从名称随意猜测，也不把旧 JSON 直接覆盖新 manifest。已有兖矿、招行等公司优先匹配现有 ID。
2. **来源候选与当前事实**：旧 V4 为多候选不可覆盖；当前 `src/data/data-engine.ts` 的 `writeFact` 更新相同自然键并重建证据链接，符合当前架构文档第 18 节。不能将 47 条观测逐条灌入 facts。建议增加独立候选/审核层，保留来源版本；经明确选定的值才进入现值 facts。
3. **数值语义**：旧库支持 decimal 文本、上下界、比较符、缺失原因、原单位与币种；当前事实只有 number/text/boolean。`gt 5500` 不能变成精确的 5500，范围值不能擅取中点；产品标价不能映射成销售均价。需保留原值并显式转换单位。
4. **实体与历史**：旧库支持多语言/历史名称、法律状态、事件、网站、地址和实体关系。当前公司 manifest/管理层结构无法完整覆盖；先原样保全，适配时逐项给出目标或未映射原因。
5. **覆盖和问题**：quality_issues、research_questions、coverage_* 在当前 repo 无对应功能，应作为小范围后续模块，而非丢弃或混入 notes 后声称迁移完成。
6. **导入器边界**：当前 `import:legacy` 主要保留文件并处理 observations.csv，不是旧 V2/V4 SQLite 的领域转换器。保留旧 SQLite 作为 artifact 只是保全，不等于已可查询使用。

## 5. 建议执行顺序与删除条件

1. **保全**：记录旧 Git commit，导出可恢复的 Git bundle；对外部 SQLite 使用 Backup API 生成一致性备份，并登记原始文件清单/哈希。保存 ID 映射和源路径配置。此轮未执行备份。
2. **文档迁移**：先迁两份 charter、两份 BRD、两份试点记录；历史规范明确标注已被取代，并修复内部链接。
3. **数据 dry-run**：开发只读 V2/V4 adapter，对 40 家公司输出匹配、新增、冲突、缺失字段和未映射记录清单；业务数据只写 staging。
4. **宇树试点**：保留全部来源候选与证据；校验 47 条观测、67 条链接、7 个文件和 9 个冲突序列均可追溯，不能仅以目标 facts 行数衡量成功。
5. **扩展与切换**：完成其余身份资料、名称/证券和原始材料对账；验证重复导入、失败回滚、档案审计、Web/Agent 查询。
6. **淘汰**：确认新入口不再依赖旧 Python 脚本后停止维护；保留一次可恢复的历史归档，再逐步移除旧工作目录。

可优先清理的是 `.DS_Store`、`__pycache__` 等缓存。`.obsidian` 属个人编辑器偏好，按是否继续使用决定；`tmp/` 含 2 个 PDF 抽取文本和 7 张页面图，确认可从已保留 PDF 重建后再清理，不能只凭目录名判为无价值。`config/local.json` 虽不进 Git，但仍是外部档案定位信息，切换完成前保留。

**不要直接删除整个旧 repo 或外部 Investment Archive。** 源码已过时不等于研究数据无价值。允许退休旧实现的验收标准是：数据已对账、证据可打开、未映射语义有保全、恢复路径已验证。
