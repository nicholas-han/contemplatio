> 历史参考：迁自 investment-analysis（b57076f，2026-09-08）。本文描述旧架构或历史试点，不替代当前架构规范，文中状态与数据截止日期保持原样。

# 公司研究数据模型设计草案

> 状态：讨论稿，不代表已批准的数据库迁移\
> 基于：[公司研究信息框架](../../../requirements/company-research.md)与[公司基本面研究系统业务需求](../../../requirements/research-system.md)\
> 示例公司：宇树科技股份有限公司\
> 设计日期：2026-08-12

## 1. 设计结论

公司研究档案不适合全部塞进 SQLite，也不适合按 BRD 标题建立几十份相互独立的 Markdown 或 JSON。建议采用四层存储：

| 层次 | 保存内容 | 首选形式 | 原因 |
|---|---|---|---|
| 原始证据层 | PDF、网页快照、表格、录音、视频、图片、原始数据包 | 文件系统 | 保真、可校验哈希、适合大文件和原始格式 |
| 规范事实层 | 身份、关系、事件、产品、财务和经营观测值 | SQLite 类型化表 | 可约束、可查询、可关联、可保留历史 |
| 分析模型层 | 指标定义、公式、假设、情景、模型运行及估值结果 | SQLite 元数据与输入输出快照；代码/表格文件保存模型本体 | 既可复现，又不把复杂模型硬塞入关系表 |
| 研究表达层 | one-pager、memo、行业图谱、长篇判断和复盘 | Markdown/电子表格文件；SQLite 登记版本和关键结论 | 适合人工阅读，同时保留检索、状态与依赖关系 |

最重要的结构不是章节，而是下面这条可追溯链：

```text
原始文件/网页
    -> 原始披露事实
    -> 标准化事实
    -> 衍生指标
    -> 分析员假设/判断
    -> 预测与估值结果
    -> 投资结论
```

每一条边都必须显式保存。系统不能只保存最后一个数字或一篇最新报告。

## 2. 与当前 V2 的关系

当前绝大多数 `company.sqlite` 仍为只含 `company_names` 和 `securities` 的 V2。2026-08-13 已批准并完成宇树科技单公司 V3 Phase A 试点；随后以 V4 增加多来源观测候选和默认推荐只读视图。V3 只引入证据、实体、统一指标定义、观测值、覆盖和质量控制，V4 不新增权威事实表；后续业务、风险、预测、估值与 thesis 仍是目标设计。

建议保持以下边界：

- `catalog.sqlite` 继续只保存跨公司检索所需的最小索引；
- 每家公司仍有独立的 `company.sqlite`；
- 公司原始资料和研究文件仍放在该公司目录；
- 所有新增结构通过版本化迁移引入；
- 先用宇树科技 V4 档案做写入和多来源版本试点，同时让全库校验兼容现有 V2 档案；其他公司只有在单独批准后才迁移。

### 2.1 `company.json` 的长期定位

当前 `company.json` 保存成立年份、注册地和网站。长期看，这些字段会出现名称变更、司法辖区变更、多个网址、来源冲突和历史版本，JSON 无法充分表达证据与时间。

建议将 `company.json` 收缩为档案入口清单：

```json
{
  "version": 3,
  "company_id": 100039,
  "database": "company.sqlite",
  "research_subject_entity_id": 100000
}
```

成立日期、法律形式、地址、网站等业务事实进入 SQLite。该调整只有在正式迁移获批后执行。

## 3. 公司目录建议

不移动现有人工目录，只为系统生成内容规定位置：

```text
Investment Archive/宇树科技/
├── company.json
├── company.sqlite
├── _materials/                 # 原始资料，保留原格式
├── _reports/                   # 外部研报和人工报告
├── _models/                    # Excel、Python 等模型本体
└── _research/                  # 系统管理的派生内容
    ├── extracted/              # OCR、转录、清洗文本、表格提取
    ├── artifacts/              # one-pager、memo、thesis tracker
    ├── imports/                # 可重放的导入清单
    └── exports/                # 可再生成的视图和导出文件
```

规则：

- 数据库只保存相对公司目录或 Archive 根目录的路径；
- 原始文件一经登记不做无痕覆盖，修订版作为新文档版本；
- `extracted` 与 `exports` 都是可再生成内容，不能替代原始资料；
- 文件哈希用于去重和完整性检查，文件名不承担稳定标识职责。

## 4. 跨模块统一语义

### 4.1 信息性质

所有事实、数字和研究内容都必须使用下列一种 `information_class`：

| code | 含义 | 是否需要证据 | 是否需要人工确认 |
|---|---|---:|---:|
| `disclosed_fact` | 来源直接披露的原始事实 | 是 | 高影响项需要 |
| `standardized_fact` | 经单位、币种、期间或口径转换的事实 | 需要来源事实及转换规则 | 视规则而定 |
| `derived_result` | 按确定公式计算的结果 | 需要输入与公式 | 公式批准后可自动 |
| `ai_inference` | AI 摘要、分类、关系或解释候选 | 是 | 正式使用前需要 |
| `analyst_estimate` | 对缺失历史事实的分析员估算 | 是 | 是 |
| `management_guidance` | 管理层对未来的口径 | 是 | 不等于客观预测 |
| `market_consensus` | 市场一致预期或第三方预测 | 是 | 需要标明提供方 |
| `analyst_assumption` | 预测或估值使用的未来假设 | 支持证据可多条 | 是 |
| `analyst_judgment` | 商业、竞争、治理等判断 | 支持与反对证据 | 是 |
| `investment_conclusion` | thesis、评级或行动结论 | 完整依赖链 | 是 |
| `question` | 未知、冲突或待验证问题 | 关联已有证据 | 关闭时需要理由 |

不能通过文字语气猜测信息性质，也不能把公司披露的主张直接标成独立验证的事实。

### 4.2 双时间轴

会变化的数据至少区分两类时间：

1. 业务时间：事实在现实世界适用的时间，如任职期间、财务期间、产品在售期间；
2. 知识时间：信息何时公开、何时进入系统、何时被后续版本取代。

统一字段建议：

| 字段 | 含义 |
|---|---|
| `valid_from` / `valid_to` | 事实在现实世界的有效区间 |
| `period_start` / `period_end` / `as_of_date` | 数值对应的期间或时点 |
| `published_at` | 来源首次公开时间 |
| `known_from` | 在研究档案中可被视为已知的最早时间 |
| `recorded_at` | 本系统录入时间 |
| `superseded_at` | 本记录被新版本取代的时间 |
| `date_precision` | `day`、`month`、`quarter`、`year` 或 `unknown` |

缺少具体日期时保存已知精度，不用虚构的 `01-01` 代替“只知道年份”。

### 4.3 版本而非覆盖

- 原始资料修订：新建 `document_version`，通过 `revises` 关系连接旧版；
- 事实纠错：新建事实记录，通过 `corrects` 或 `supersedes` 连接旧记录；
- 口径变化：新建指标定义版本，不修改历史定义；
- 观点变化：新建 thesis 版本并保存改变原因；
- 模型变化：固定模型版本、输入快照和运行环境。

只有拼写、排版等不改变语义的元数据可以原位修正，并仍需审计时间。

### 4.4 证据定位

一条证据链接至少包含：

- 文档版本；
- 页码、表格、段落、网页区块或音视频时间戳；
- 证据角色：`supports`、`contradicts`、`context`、`defines`；
- 可选短摘录；
- 提取方式与审核状态。

完整文档正文不复制进 SQLite。OCR/转录文本保存为旁路文件，数据库只登记路径、哈希、工具版本和状态。

### 4.5 不确定性、近似值和区间

数值不能只用一个 `REAL value`。观测值需要表达：

- 精确值、约数、上限、下限、区间或缺失；
- 原始文本与原始单位；
- 标准化值与标准单位；
- 来源口径、合并范围和维度；
- `unknown` 与 `not_applicable` 的区别。

金额和比率优先保存为十进制定点文本或整数尾数加小数位，不以二进制浮点数作为权威原值。

### 4.6 冲突处理

冲突来源不能强行合并成一个“最佳值”。应保留双方记录，并创建质量问题：

```text
issue_type = conflicting_evidence
status = open
candidate_a = 某公司网页的口径
candidate_b = 监管文件的口径
resolution = NULL
```

人工解决后，新增一个规范事实，并记录选择理由；原冲突记录继续保留。

### 4.7 NULL 语义

禁止用 `0`、空字符串或“暂无”混合表达缺失。建议使用状态字段：

| 状态 | 含义 |
|---|---|
| `reported` | 已披露 |
| `estimated` | 已估算 |
| `not_reported` | 应有但未披露 |
| `not_available` | 客观无法取得 |
| `not_applicable` | 对该公司或期间不适用 |
| `not_yet_researched` | 尚未研究 |

## 5. BRD 逐模块存储决策

下表覆盖 `company.md` 的每个业务模块。表名是逻辑名称，最终物理表可按迁移阶段实现。

### 5.1 公司信息

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 公司身份 | SQLite 类型化事实 | `entities`、`entity_names`、`entity_identifiers`、`entity_locations`、`websites`、`securities`、`listings` | 法定名称、统一社会信用代码、有限公司成立日、股份公司成立日分别保存；不能压成一个“成立年份” |
| 历史沿革 | SQLite 事件 + Markdown 阶段总结 | `events`、`event_participants`、`event_relations`、`artifacts` | H1 发布、G1 发布、股份制改造、IPO 申报分别为事件；“发展阶段”是可版本化总结 |
| 股权、控制权与集团结构 | SQLite 时态关系 | `entities`、`entity_relationships`、`ownership_interests`、`control_assessments` | 股东持股比例按 `valid_from/valid_to` 保存；保荐机构关联持股与普通股东关系区分 |
| 治理结构 | SQLite 人物/任职 + 原文材料 + 判断 | `persons`、`governance_bodies`、`positions`、`governance_memberships`、`research_items` | 王兴兴担任法定代表人/董事长/CEO 是不同角色记录；“执行能力强”只能是分析判断 |

### 5.2 业务、商业模式与经营体系

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 业务构成与边界 | SQLite 主数据 + 指标观测 | `business_segments`、`products`、`segment_memberships`、`observations` | 人形机器人、四足机器人、组件、具身智能模型作为业务/产品层级，不把网页导航直接当财务分部 |
| 战略与执行 | SQLite 承诺与里程碑 + Markdown 判断 | `strategic_commitments`、`milestones`、`events`、`research_items` | “核心技术全栈自研”记录为公司战略主张；具体自研部件和量产阶段作为验证里程碑 |
| 商业模式与单位经济性 | 类型化关系、指标和公式 | `business_models`、`revenue_mechanisms`、`contracts`、`metric_definitions`、`observations` | G1 标价、产品销量、单位成本和售后期限分开；网页标价不是已实现平均售价 |
| 客户、渠道与市场 | SQLite 关系 + 聚合指标 | `business_relationships`、`channels`、`customer_groups`、`markets`、`observations` | 高校/科研机构、科技企业、消费用户作为客户群；未披露客户不得由宣传案例反推出收入占比 |
| 产品、技术与研发 | SQLite 产品/版本/技术 + 文件证据 | `products`、`product_variants`、`product_releases`、`technologies`、`intellectual_property`、`observations` | G1 与 G1 EDU 是产品变体；23–43 个关节电机是规格区间；官网当前价格带有效时间 |
| 供应、生产与履约 | SQLite 设施/关系/指标 + 风险 | `facilities`、`business_relationships`、`production_processes`、`observations`、`risks` | 核心零部件自研自产与装配劳务外包并存，不能用单一“自产率”文字概括 |
| 关键资源与核心能力 | SQLite 能力对象 + 因果关系 + 判断 | `capabilities`、`capability_components`、`dependencies`、`research_items` | 一体化关节、运动控制、激光雷达、产品技术复用分别建能力记录，并关联产品和证据 |
| 经营数据与经营质量 | 通用指标定义与观测系统 | `metric_definitions`、`metric_definition_versions`、`observations`、`observation_dimensions`、`observation_lineage` | 2025 年人形机器人出货量“超过 5,500 台”保存为 `gt 5500`，不能改成精确 5,500 |

### 5.3 外部环境、行业与竞争

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 宏观与制度环境 | 外部因子时序 + 因果链 + 文档 | `external_factors`、`observations`、`causal_links`、`documents` | 出口管制、关税、机器人安全标准分别建因子，并连接海外收入、进口物料和成本风险 |
| 行业定义与产业链 | SQLite 图结构 + Markdown 行业图谱 | `markets`、`market_scopes`、`value_chain_nodes`、`value_chain_edges`、`artifacts` | 通用机器人、人形机器人、四足机器人边界分开；核心部件和本体处于不同价值链节点 |
| 供需、周期与结构变化 | 指标时序 + 事件 + 判断 | `metric_definitions`、`observations`、`events`、`research_items` | 行业出货、价格、产能和商业化渗透率分别记录；“爆发前夜”只能是判断而非事实 |
| 竞争格局与公司地位 | 参与者、份额观测和维度化比较 | `market_participants`、`competitive_dimensions`、`competitive_assessments`、`observations` | “全球第一”保留公司/保荐人披露属性、市场定义和期间；不直接升级为无条件客观事实 |

### 5.4 财务表现与财务质量

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 基础财务资料 | 文档 + 统一财务观测 | `documents`、`metric_definitions`、`observations`、`observation_dimensions` | 2023–2025 营收、净利润、资产等进入同一观测体系，保留合并范围和审计来源 |
| 历史财务表现 | 规范观测 + 确定性衍生指标 | `observations`、`formulas`、`observation_lineage` | 收入 CAGR 从三年收入观测计算，结果链接全部输入，不手工复制进总结表 |
| 收入与盈利驱动 | 驱动树 + 分部/产品维度观测 | `driver_models`、`causal_links`、`observations` | 销量、平均售价、产品结构、毛利率分别建指标；缺少 ASP 时明确缺口 |
| 资产负债与财务安全 | 财务观测 + 义务/情景 | `observations`、`obligations`、`scenarios` | 资产负债率保留母公司与合并两个 scope，不能只保留一个数字 |
| 现金流与盈利质量 | 财务观测 + 调整桥 + 判断 | `observations`、`reconciliations`、`research_items` | 经营现金流、净利润和扣非净利润的差异通过桥接项解释，判断单独保存 |
| 会计政策与报表质量 | 政策版本 + 变更事件 + 质量问题 | `accounting_policies`、`events`、`quality_issues`、`research_items` | 收入确认和股份支付政策以适用期间保存；异常信号不得直接改写报表值 |

### 5.5 资本配置与股东回报

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 资本来源与资金需求 | 融资工具、融资事件和指标 | `capital_instruments`、`events`、`cash_flows`、`observations` | 私募融资、IPO 发行和经营现金流是不同来源；拟募集资金不等于已取得资金 |
| 资本配置行为 | 事件 + 金额/目的维度 | `capital_allocation_actions`、`events`、`observations` | 研发投入、产线投入、并购和股权激励分开，关联批准日、执行日和实际金额 |
| 股东回报 | 证券行动和每股指标 | `corporate_actions`、`securities`、`observations` | 报告期无现金分红应保存为披露事实；不能用 NULL 表示“无”与“未披露”两种状态 |

### 5.6 重大事项、风险与潜在义务

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 重大事项 | 事件主表 + 参与方 + 影响关系 | `events`、`event_participants`、`event_impacts` | IPO 申报是事件，受理、问询、注册、发行、上市必须是独立阶段事件 |
| 风险识别与传导 | 风险登记册 + 因果图 + 指标 | `risks`、`risk_causes`、`risk_impacts`、`risk_indicators` | 海外贸易限制风险连接“境外收入占比超过 40%”和“进口物料约占 20%”两项证据 |
| 或有事项与隐性义务 | 义务、概率、金额区间和到期结构 | `obligations`、`obligation_schedules`、`events` | 未发现不等于没有；没有覆盖资料时状态应为 `not_yet_researched` |

### 5.7 预测与情景分析

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 核心驱动因素 | 驱动树和指标关系 | `driver_models`、`causal_links`、`metric_definitions` | 人形/四足销量、ASP、产品结构、毛利率、研发费用率和海外占比作为候选驱动 |
| 预测假设与结果 | 场景、假设和未来观测 | `scenarios`、`assumptions`、`model_runs`、`observations` | 基准/乐观/悲观情景各自引用同一指标定义，但假设值和确认人不同 |
| 敏感性与可证伪性 | 参数网格 + 模型结果 + 失效条件 | `sensitivity_runs`、`model_run_outputs`、`falsification_tests` | 对销量、ASP、毛利率做二维敏感性；“商业化不及预期”转成可观测阈值 |

### 5.8 估值分析

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 估值对象与前提 | 估值运行头 + 对象/基准日 | `valuation_runs`、`valuation_subjects`、`scenarios` | 明确估值对象是 IPO 前股权、发行后稀释股权还是某只上市证券 |
| 内在价值方法 | 模型版本 + 输入/输出 | `model_versions`、`valuation_methods`、`model_runs` | DCF 只有在现金流假设获确认后运行；模型文件保留在 `_models` |
| 相对估值方法 | 可比集版本 + 指标快照 + 调整 | `comparable_sets`、`comparable_members`、`valuation_adjustments` | 每次可比公司集合冻结版本，不能随最新名单无痕变化 |
| 其他估值方法 | 方法插件元数据 + 运行结果 | `valuation_methods`、`model_runs` | 高成长机器人企业可同时做情景收入倍数和 DCF，但结论分开 |
| 估值结论与敏感性 | 区间结果 + 调整桥 + 判断 | `valuation_outputs`、`valuation_adjustments`、`research_items` | 保存区间、币种、每股/整体口径和安全边际；单点只是区间内的一个结果 |

### 5.9 市场定价与预期

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 证券与交易信息 | 证券/上市主数据 + 市场观测 | `securities`、`listings`、`corporate_actions`、`observations` | IPO 申请期间 listing 状态为 `applied`，不能预填未来代码或发行价 |
| 历史定价 | 高频数据文件 + 日/月度规范观测 | `datasets`、`observations`、`events` | 上市后日线可保存 Parquet/CSV，数据库保存数据集元数据和月度/事件快照 |
| 市场预期与分歧 | 预期观测 + 叙事/判断 | `expectation_sources`、`observations`、`research_items` | 公司指引、卖方一致预期和内部预测必须使用不同 `information_class` |

### 5.10 投资判断

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 核心投资逻辑 | 原子 thesis 节点 + 因果依赖 | `theses`、`research_items`、`item_relations` | “产品领先 -> 放量 -> 规模效应 -> 现金流”拆成可分别验证的节点，不只存一段话 |
| 回报、催化剂与路径 | 催化剂事件、目标条件和回报桥 | `catalysts`、`milestones`、`valuation_outputs` | IPO、量产、下游落地分别建候选催化剂，并保存是否发生及发生后影响 |
| 风险、反方观点与失效条件 | 反方 thesis + 风险 + 明确测试 | `counter_theses`、`risks`、`falsification_tests` | 续航、可靠性、需求刚性和竞争加剧转成可检验条件，而非泛泛风险段落 |

### 5.11 证据、研究记录与持续跟踪

| BRD 模块 | 主数据形式 | 核心结构 | 宇树科技示例 |
|---|---|---|---|
| 资料与证据 | 文件 + SQLite 文档索引/证据链接 | `document_families`、`documents`、`document_files`、`evidence_links` | 上市保荐书 PDF 登记哈希、发布日期、发行人、页码定位和访问路径 |
| 待解决问题与证据冲突 | 正式问题与质量问题 | `research_questions`、`quality_issues`、`item_relations` | 官网 G1 当前价格与历史发布价不同，不覆盖；建立价格版本并查明生效时间 |
| 定期更新 | 覆盖要求、游标和检查结果 | `coverage_requirements`、`update_cursors`、`review_runs` | 招股材料、年度财务、产品网页分别设置频率和最新处理时间 |
| 事件驱动更新 | 事件订阅 + 影响图 | `watch_rules`、`events`、`item_relations` | 新产品发布后标记受影响的产品组合、销量假设、竞争判断和估值模型 |
| 观点演变与复盘 | 版本化 thesis + 预测评估 | `theses`、`thesis_reviews`、`forecast_evaluations`、`artifacts` | 保存申报时、发行时和上市后的不同观点，事后比较当时可用信息与实际结果 |

## 6. 核心逻辑表组

### 6.1 `research_items`：统一证据链的骨架

`research_items` 不是把所有数据做成 EAV，而是为所有“可被证据支持或被其他结论依赖的记录”提供统一身份。类型化扩展表继续负责业务约束。

公共字段：

```text
item_id
item_type
information_class
topic_code
review_status
confidence_level
valid_from / valid_to
known_from / recorded_at / superseded_at
supersedes_item_id
created_by_type / created_by
```

例如一条财务观测在 `observations` 中保存数值与期间，同时用相同 `item_id` 连接证据、输入、判断和后续模型。

### 6.2 文档与证据

建议表：

| 表 | 职责 |
|---|---|
| `document_families` | 同一报告、网页或数据集的稳定身份 |
| `documents` | 某一次发布/修订/抓取的具体版本 |
| `document_files` | 原件、网页快照、OCR、转录、结构化提取等文件表示 |
| `document_relations` | 修订、翻译、附件、重复、引用关系 |
| `evidence_links` | 研究记录到文档具体位置的支持/反对/定义关系 |
| `processing_runs` | 提取工具、版本、输入、输出、状态和错误 |

文档唯一性不能只依靠 URL；URL 会失效或内容会变化。至少组合使用发布方、文档类型、报告期、发布日期和文件哈希。

### 6.3 实体、人物与关系

建议表：

```text
entities
entity_names
entity_identifiers
entity_locations
websites
entity_relationships
ownership_interests
persons
positions
governance_bodies
governance_memberships
```

`entity_relationships` 保存法律/业务关系；`ownership_interests` 专门保存持股、表决权、控制方式和合并口径，不应将复杂股权塞进通用关系的 JSON。

### 6.4 事件

事件是多个模块共享的一级对象。建议字段：

```text
event_id / item_id
event_type
title
announced_date
effective_date
completed_date
status
summary
```

通过 `event_participants` 连接公司、人物、证券、产品和监管机构；通过 `event_impacts` 连接受影响的事实、风险、假设和 thesis。

### 6.5 产品、业务和经营体系

产品需要稳定产品身份与版本分离：

```text
products                  # G1 产品族
product_variants          # G1、G1 EDU 或具体配置
product_releases          # 某版本发布/量产/停售
technologies              # 一体化关节、运动控制等
product_technologies      # 产品使用哪些技术
business_segments         # 管理/披露分部或研究者定义业务线
segment_memberships       # 产品/收入机制归入何种业务线
facilities                # 产线、研发中心、仓储等
business_relationships    # 客户、供应商、渠道、外包、合作方
```

产品规格若会跨产品比较，应定义为指标并进入观测系统；仅用于展示且高度异构的说明可保留在产品文档，不应建立无限宽产品表。

### 6.6 统一指标与观测系统

财务、经营、产品、行业、市场价格和模型输出共享同一套“定义 + 观测”机制，但使用明确类别和维度。

核心表：

```text
metric_definitions
metric_definition_versions
units
dimension_types
dimension_members
observations
observation_dimensions
observation_evidence
observation_lineage
formulas
```

`metric_definition_versions` 至少保存：

- 指标业务定义；
- 值类型、单位与币种规则；
- instant/duration 期间类型；
- 合并范围；
- 允许的维度；
- 计算公式或来源口径；
- 生效区间。

`observations` 至少保存：

- 原始值文本；
- 比较符号 `eq/approx/gt/gte/lt/lte/range`；
- 精确值或上下界；
- 单位、币种；
- 期间、时点和财年标签；
- `actual/guidance/forecast/consensus/model_output`；
- 披露/标准化/衍生性质；
- 数据状态和审核状态。

维度不能长期塞在 `dimensions_json`。产品、地区、渠道、客户类型、分部、场景和合并范围都应使用受控的 `dimension_members`，从而支持去重与跨期比较。

### 6.7 财务数据

不建议为利润表、资产负债表、现金流量表各建一张宽表。它们本质上都是“财务概念在期间和维度上的观测”。用指标系统可统一处理：

- 报表重述；
- 分部/地区维度；
- 原始披露值与标准化值；
- 多会计准则；
- 合并与母公司口径；
- 预测与实际比较。

报表结构由 `statement_presentations` 保存，它只定义展示顺序和小计，不复制数值。

### 6.8 风险、问题与义务

三者不能混为一个 notes 表：

- `risks`：未来可能发生、带概率和影响的事项；
- `quality_issues`：当前数据本身的缺失、冲突、异常或过期；
- `research_questions`：需要研究者回答的问题；
- `obligations`：已经存在或可能触发的现金/履约义务。

风险通过原因、传导节点、影响对象和监测指标形成图，而不只保存风险描述。

### 6.9 预测、模型与估值

模型本体可为 Python、电子表格或其他文件。数据库保存：

```text
models
model_versions
scenarios
assumptions
model_runs
model_run_inputs
model_run_outputs
sensitivity_runs
valuation_runs
valuation_adjustments
comparable_sets
```

一次模型运行必须冻结：

- 模型版本和文件哈希；
- 数据截止时间；
- 情景与全部假设版本；
- 输入观测 ID；
- 输出观测 ID；
- 运行时间、环境和状态。

模型输出同样进入 `observations`，但 `information_class = derived_result`、`value_kind = model_output`，从而可与实际结果比较。

### 6.10 Thesis 与研究成果

长篇 memo 仍适合 Markdown；可检验结论需要拆成结构化节点：

```text
theses
thesis_nodes
item_relations
falsification_tests
catalysts
thesis_reviews
artifacts
artifact_versions
```

每个 thesis 节点标明它是事实、判断还是假设，并通过 `depends_on`、`supports`、`contradicts`、`invalidates` 连接。这样新资料进入时，系统才能定位受影响的结论。

### 6.11 覆盖与持续更新

“完整”需要可计算的覆盖定义：

```text
coverage_scopes
coverage_requirements
coverage_results
update_cursors
watch_rules
review_runs
```

例如宇树科技可定义：

- 2023 年至今监管披露必须覆盖；
- 2023–2025 三年主要财务报表必须覆盖；
- 主要在售机器人产品页每月检查；
- IPO 状态按事件触发更新；
- 高影响事实必须人工复核。

### 6.12 ID、跨公司引用与数据库边界

每个 `company.sqlite` 是一个独立档案，因此需要区分三类身份：

| 身份 | 作用域 | 规则 |
|---|---|---|
| `company_id` | 整个 Investment Archive | 由 `catalog.sqlite` 分配，永久稳定 |
| 本地行 ID | 单个 `company.sqlite` | 无业务含义的整数主键，只在本库内引用 |
| 外部标识 | 外部制度或数据源 | 统一社会信用代码、LEI、ISIN、MIC、专利号等，保存类型、值、司法辖区和有效期 |

研究主体实体通过 `entities.catalog_company_id` 连接 catalog。另一家公司如果已经进入 catalog，也可以保存其 `catalog_company_id`；尚未入档的客户、供应商或竞争者只使用本地实体 ID 和可验证的外部标识。

本地 `entity_id`、`person_id`、`item_id` 不应被当成跨库全局 ID。跨公司汇总时使用：

1. `catalog_company_id` 连接已建档公司；
2. 强标识符连接法律实体或证券；
3. 没有强标识符时生成候选匹配，必须人工确认，不能只按名称自动合并。

### 6.13 共享字典与行业扩展

指标定义、单位、币种、交易所、关系类型和常用维度不能由每家公司自由命名，否则无法跨公司比较。建议：

- 在 Git 仓库中版本化维护通用参考字典和 SQL seed；
- 每个公司库保存实际使用的定义版本或其不可变快照，确保离线可复现；
- 通用指标使用命名空间，如 `cn_gaap.revenue`、`operating.shipments`；
- 行业指标使用命名空间，如 `robotics.humanoid_shipments`；
- 公司特有指标只有在确实不可通用时使用 `company_specific.*`，并要求定义说明；
- 指标升级定义时增加 `metric_definition_version`，历史观测继续引用旧版本；
- 跨公司比较必须显式声明允许的定义版本和转换规则。

行业扩展应增加指标、维度、关系类型和模型插件，不复制一整套公司主数据表。例如机器人行业扩展可增加自由度、负载、续航、关节扭矩、产品形态、部署场景等指标；银行扩展则增加净息差、不良率和资本充足率等指标。

### 6.14 全文检索与大规模数据

不同数据规模采用不同形式：

| 数据 | 权威保存 | 检索/计算形式 |
|---|---|---|
| PDF、网页、音视频 | 原始文件 | 提取文本 + SQLite FTS5 可重建索引 |
| 财务与经营低频序列 | SQLite `observations` | SQL 查询和导出 |
| 日度市场数据 | 原始供应商文件 + 分区 Parquet | SQLite 登记数据集、字段、期间、哈希和关键快照 |
| 分钟/Tick 数据 | 分区 Parquet，不逐行塞进公司 SQLite | 按需使用列式查询工具；只把研究实际使用的快照和结果入库 |
| OCR、ASR、表格提取 | UTF-8 文本/JSONL/Parquet 旁路文件 | SQLite 登记处理运行、路径、哈希和页码映射 |

FTS 索引和 Parquet 派生数据都不是事实来源。索引可删除重建，任何进入研究链的内容仍需指向不可变的文档版本和定位器。

### 6.15 完整性、性能与维护

正式 Schema 应执行以下维护约束：

- 所有连接开启 `PRAGMA foreign_keys = ON`；
- 数据库继续使用 `DELETE` journal，避免 Dropbox 同步 WAL 旁路文件；
- 金额和高精度比率的权威值使用十进制文本或整数尾数/小数位，计算层使用 Decimal；
- 高频查询为指标+期间、主体+关系、文档族+版本、开放问题/风险状态，围绕这些组合建索引；
- `research_items` 与类型化扩展表的一一对应和 `item_type` 一致性由触发器及校验命令保证；
- 受控枚举优先用参考表；非常稳定且分支少的状态才使用 `CHECK`；
- 每次迁移先用 SQLite Backup API 生成完整备份，再执行 `foreign_key_check`、`integrity_check` 和领域校验；
- 所有导入可重放，记录输入文件哈希、程序版本、开始/完成时间和错误；
- 写入采用短事务并保持单机单写者，不让长时间 AI 处理占用数据库事务；
- 自动生成视图、FTS 和导出文件必须可由权威数据重建。

### 6.16 从当前 V2 迁移的边界

vNext 正式迁移需要专门处理现有两张表：

1. 为研究主体创建 `entities` 行，并用 catalog 的 `company_id` 建立桥接；
2. 将 `company_names` 演进为带 `entity_id` 和 `research_item` 身份的名称记录，保留原 `company_name_id` 映射；
3. 为 `securities` 增加发行实体，并将交易所上市状态拆入 `listings`；
4. IPO 申请、受理、发行和正式上市用 `listing` 状态与事件表达，不用虚构未来证券代码；
5. 将 `company.json` 中的成立、注册地和网站转成有证据、有时间的 SQLite 记录；
6. 完成双写或对账期后，才把 `company.json` 收缩为入口清单；
7. V3 Phase A 已由 `003_v2_to_v3.sql` 正式实现；`004_v3_to_v4.sql` 进一步加入多来源观测推荐视图。两步迁移目前仅应用于宇树科技；vNext 提案 SQL 继续用于尚未实施的后期模块，不直接作用于正式库。

当前 `proposals` 下的 SQL 仍是完整目标模型的关系验证稿；正式 Phase A 表结构以 `research/database/migrations/003_v2_to_v3.sql` 为准，当前推荐视图以 `research/database/migrations/004_v3_to_v4.sql` 为准，二者均未穷举后期模块的所有物理表。

## 7. 宇树科技贯穿示例

本节只展示数据落法。完整示例另见 [宇树科技结构化示例](unitree-company-data-example.md)。

### 7.1 身份事实

监管文件披露：有限公司成立于 2016-08-26，股份公司成立于 2025-05-28。这是两个不同事实：

```text
entity_event: incorporation, legal_form=limited_company, effective_date=2016-08-26
entity_event: conversion, legal_form=company_limited_by_shares, effective_date=2025-05-28
```

公司当前法定名称保存为带有效期的 `entity_name`，历史名称保留为旧版本，不覆盖。

### 7.2 产品规格与价格

G1 和 G1 EDU 是两个 `product_variant`。官网当前页面显示：

```text
metric = product.list_price_tax_inclusive
variant = G1
value = 85000
currency = CNY
comparison = eq
as_of_date = 2026-08-12
information_class = disclosed_fact
```

历史发布材料中的 9.9 万元起是另一条历史价格记录。两者通过有效时间连接，不能覆盖成“G1 价格为 8.5 万元”。

### 7.3 经营数据

保荐书称 2025 年人形机器人出货量“已超 5,500 台”：

```text
metric = operating.shipments
period = 2025-01-01/2025-12-31
dimension.product_family = humanoid_robot
value = 5500
comparison = gt
unit = unit
information_class = disclosed_fact
```

原文还限定“纯人形，不含轮式双臂机器人”，该限制应进入指标定义或维度，不可丢失。

### 7.4 财务原值与标准化值

2025 年营业收入披露为 `169,926.93 万元`：

```text
原始观测：169926.93，unit=CNY_10K，period=FY2025，scope=consolidated
标准化观测：1699269300，unit=CNY，lineage=normalized_from(原始观测)
```

二者都保留。所有增长率和估值输入引用标准化观测，但可以回到原始表格。

### 7.5 风险传导

“国际贸易摩擦风险”不能只是一段复制文本，可拆为：

```text
risk: 海外贸易限制升级
cause: 关税/出口管制政策变化
exposure_1: 境外收入占比 > 40%
exposure_2: 进口物料约占原材料采购额 20%
impact: 收入下降、成本上升、关键物料受限
monitor: 海外收入增速、进口物料占比、限制清单状态
```

其中百分比是有证据的观测；影响路径是公司披露或分析判断，性质必须分别标记。

## 8. 不建议采用的设计

### 8.1 每个 BRD 小节一张表

同一事件、人物、数字会在多个章节重复，更新时极易不一致。BRD 是阅读框架，不是物理数据库边界。

### 8.2 一个万能 `facts(key, value, json)` 表

短期灵活，长期失去类型、单位、唯一性、外键和口径约束。只允许用通用 assertion 结构承载尚未稳定的长尾事实，成熟字段应升级为类型化表。

### 8.3 全部保存为 JSON

复杂查询、去重、历史版本、关系完整性和迁移会迅速失控。JSON 只用于技术上天然异构的定位器、外部 API 原始元数据等边缘字段。

### 8.4 只保存最新状态

无法复原历史认识，也无法检验预测和 thesis。最新视图应由历史记录查询生成。

### 8.5 把摘要当证据

摘要和 AI 归纳属于派生内容，不能替代原文、页码、表格或录音时间戳。

### 8.6 把模型公式只放在 Excel 单元格

模型文件可以是 Excel，但数据库必须登记版本、哈希、输入和输出，否则无法解释结果为何改变。

### 8.7 直接复活已经移除的旧 Schema

旧导入样本中已经出现过 `entities`、`documents`、`research_items`、`observations` 和证据关系，方向并非全部错误，但不能原样恢复。旧结构暴露出的主要维护问题包括：

- 大量语义化字符串 ID，重命名和实体合并成本高；
- `attributes_json` 与 `dimensions_json` 承担过多核心业务语义；
- 指标定义未版本化，定义变化会影响历史可比性；
- 一条记录通常只连一个文档位置，难以保存多证据、反证和冲突；
- 事实、公司陈述、分析员判断和问题的状态枚举不够统一；
- 业务时间、公开时间、系统获知时间没有完整分离；
- 证券、人物、关系与研究主体的边界曾过度耦合。

新设计保留旧方案中“实体、观测、证据、血缘”的正确方向，但改用类型化扩展表、受控维度、定义版本、双时间轴和多对多证据链。

## 9. 分阶段实施建议

### 阶段 A：证据与事实基础

优先实现：

1. 文档、文件版本与证据定位；
2. 实体、名称、标识、人物和关系；
3. 统一指标定义与观测；
4. 研究问题、冲突和审核状态；
5. 宇树科技的身份、主要产品和 2023–2025 财务示例。

这是后续所有模块的依赖，不应跳过。

### 阶段 B：业务、行业与风险

实现产品/技术、业务关系、市场/产业链、事件、风险和义务。使用宇树科技产品矩阵与风险披露压力测试。

### 阶段 C：模型、估值与 thesis

在指标和证据稳定后，再加入模型版本、情景、假设、估值、thesis 和复盘。

### 阶段 D：自动更新与跨公司分析

最后实现覆盖规则、更新游标、事件影响传播和跨公司导出。跨公司分析从各公司库生成专用只读数据集，不把全部详细数据塞回 `catalog.sqlite`。

## 10. 迁移验收条件

进入正式 Schema 前，至少满足：

- 能从宇树科技 2025 年营业收入追溯到监管 PDF 的具体页表；
- 能同时保存 G1 历史发布价和当前网页价格；
- 能表达“超过 5,500 台”而不丢失比较符号和产品范围；
- 能区分 2016 年有限公司成立与 2025 年股份公司成立；
- 能保留互相冲突的来源并在解决前不产生虚假唯一值；
- 能用同一指标体系保存财务实际、公司指引、内部预测和模型输出；
- 能从一个估值结果反向找到模型版本、情景、假设、输入观测和原始证据；
- 能查询某一历史日期当时系统已经知道的事实和当时有效的 thesis；
- `PRAGMA foreign_key_check`、`integrity_check` 和领域校验全部通过；
- 迁移前生成 SQLite 完整备份并可验证回滚。

## 11. 宇树示例的一手资料基线

- 宇树科技公司信息页：<https://www.unitree.com/operate/company/>
- 宇树科技 G1 产品页：<https://www.unitree.com/cn/g1/>
- 宇树科技新闻中心：<https://www.unitree.com/cn/news/>
- 中信证券关于宇树科技首次公开发行并在科创板上市之上市保荐书（上海证券交易所）：<https://static.sse.com.cn/stock/disclosure/announcement/c/202605/002178_20260525_X2BM.pdf>
- 中国证监会《关于同意宇树科技股份有限公司首次公开发行股票注册的批复》：<https://www.csrc.gov.cn/csrc/c105906/c7642867/content.shtml>

示例中的事实只用于验证数据结构，不代表已完成对宇树科技的投资研究或事实复核。
