> 历史参考：迁自 investment-analysis（b57076f，2026-09-08）。本文描述旧架构或历史试点，不替代当前架构规范，文中状态与数据截止日期保持原样。

# 宇树科技结构化数据示例

> 用途：验证[公司研究数据模型设计草案](company-research-data-model.md)能否表达真实公司资料。\
> 数据截止：2026-08-12。\
> 状态：示例记录，不是正式建档数据，不构成投资研究结论。\
> 本文中的 ID 均为说明用临时 ID。

## 1. 示例目标

宇树科技适合作为压力测试公司，因为它同时具备：

- 有限公司改制为股份公司的名称和法律形式变化；
- IPO 申报过程中的证券状态变化；
- 人形、四足、部组件和模型等多层产品/业务边界；
- 产品规格、网页价格、出货量和财务数字等不同类型数据；
- 公司主张、监管披露、分析判断与风险提示之间的性质差异；
- 高增长、技术快速迭代及行业定义变化带来的版本问题。

本示例重点检验“时间、口径、证据、近似值、维度和版本”，不追求完成整家公司研究。

## 2. 原始资料登记

### 2.1 文档族

| family_id | 文档族 | publisher | document_type | 更新方式 |
|---:|---|---|---|---|
| 200001 | 宇树科技上市保荐文件 | 上海证券交易所/中信证券 | regulatory_filing | 每个申报文件独立版本 |
| 200002 | 宇树科技公司信息页 | 宇树科技 | company_webpage | 每次内容哈希变化新建版本 |
| 200003 | Unitree G1 产品页 | 宇树科技 | product_webpage | 每次规格或价格变化新建版本 |
| 200004 | 宇树科技新闻中心 | 宇树科技 | company_webpage | 新闻条目分别登记，索引页只作发现入口 |
| 200005 | 宇树科技 IPO 注册批复 | 中国证券监督管理委员会 | regulatory_decision | 每项行政决定独立版本 |

### 2.2 文档版本

| document_id | family_id | 标题/版本 | published_at | accessed_at | 可靠性说明 |
|---:|---:|---|---|---|---|
| 210001 | 200001 | 《首次公开发行股票并在科创板上市之上市保荐书》 | 2026-05，精度为 month | 2026-08-12 | 监管披露文件；财务及申报事实优先来源 |
| 210002 | 200002 | 公司信息页快照 | 未标明 | 2026-08-12 | 公司自有网页；适合公司身份和公司主张，不能自动视为独立验证 |
| 210003 | 200003 | G1 产品页快照 | 未标明 | 2026-08-12 | 公司销售页；适合当前展示规格/标价，实际成交与生效时间仍需其他证据 |
| 210004 | 200005 | 证监许可〔2026〕1612号 | 2026-07-01 | 2026-08-12 | 证监会注册结果；证明同意注册，不等于已经发行或上市 |

文档文件记录应另外保存：

```text
document_file_id
document_id
representation = original | snapshot | extracted_text | extracted_table
relative_path
sha256
mime_type
byte_size
extractor_name / extractor_version
```

网页必须保存快照或 WARC/PDF/HTML 原件；只保存 URL 无法复原历史页面。

## 3. 公司身份与历史

### 3.1 实体

| entity_id | entity_type | canonical_label | catalog_company_id | research_role |
|---:|---|---|---:|---|
| 100039 | company | 宇树科技 | 待 catalog 正式分配 | research_subject |
| 100040 | person | 王兴兴 | NULL | founder_management |
| 100041 | organization | 中信证券股份有限公司 | 可选跨库引用 | sponsor_underwriter |
| 100042 | regulator | 上海证券交易所 | NULL | regulator_disclosure_platform |

`canonical_label` 只是内部显示标签，不是带法律效力的“当前法定名称”。

### 3.2 名称

| item_id | entity_id | name | language | name_type | valid_from | valid_to | status |
|---:|---:|---|---|---|---|---|---|
| 300001 | 100039 | 杭州宇树科技有限公司 | zh-CN | legal | 2016-08-26 | 2025-05-27 | historical |
| 300002 | 100039 | 宇树科技股份有限公司 | zh-CN | legal | 2025-05-28 | NULL | current |
| 300003 | 100039 | 宇树科技 | zh-CN | common | NULL | NULL | current |
| 300004 | 100039 | Yushu Technology Co., Ltd. | en | legal | 2025-05-28 | NULL | current_disclosed |
| 300005 | 100039 | Unitree Robotics | en | brand_or_common | NULL | NULL | needs_definition_review |

注意：英文品牌与监管文件英文法定名称不能因为都出现在官网而合并为同一名称类型。

### 3.3 标识

| item_id | entity_id | identifier_type | identifier_value | jurisdiction | valid_from |
|---:|---:|---|---|---|---|
| 300010 | 100039 | cn_uscc | 91330108MA27YJ5H56 | CN | 2016-08-26 |

### 3.4 法律形式和地址事件

| event_id | event_type | title | effective_date | date_precision | status |
|---:|---|---|---|---|---|
| 400001 | incorporation | 有限公司成立 | 2016-08-26 | day | completed |
| 400002 | legal_form_conversion | 整体变更为股份有限公司 | 2025-05-28 | day | completed |
| 400003 | ipo_application_accepted | 科创板 IPO 申请获受理 | 2026-03-20 | day | completed |
| 400004 | listing_review_passed | 上市委审议通过 | 2026-06-01 | day | completed |
| 400005 | ipo_registration_approved | 首次公开发行股票注册获证监会同意 | 2026-07-01 | day | completed |

发行、证券代码确定和正式上市必须由后续发行/上市公告分别确认。本示例未取得这些后续一手文件，因此不能由“同意注册”推断“已经上市”。

公司地址作为带有效期的 `entity_location` 保存，而不是直接写在 `entities` 当前行中。监管文件披露的注册地址与官网展示的总部地点应分别使用 `registered_address` 和 `headquarters` 类型。

### 3.5 人物与任职

| item_id | person_entity_id | organization_entity_id | role_type | title | valid_from | valid_to |
|---:|---:|---:|---|---|---|---|
| 300020 | 100040 | 100039 | legal_representative | 法定代表人 | 待核实 | NULL |
| 300021 | 100040 | 100039 | founder | 创始人 | 2016 | NULL |

如果同一来源还称王兴兴为 CEO 或董事长，应建立不同任职记录；角色之间不能互相推导。

## 4. 业务、产品与技术

### 4.1 业务边界

保荐书描述的业务可先登记为四个研究业务线：

| segment_id | parent_id | segment_type | name | definition_status |
|---:|---:|---|---|---|
| 500001 | NULL | research_segment | 高性能通用机器人 | analyst_defined_from_disclosure |
| 500002 | 500001 | product_family | 人形机器人 | disclosed |
| 500003 | 500001 | product_family | 四足机器人 | disclosed |
| 500004 | 500001 | product_family | 机器人组件 | disclosed |
| 500005 | 500001 | product_family | 具身智能模型 | disclosed |

这些是业务/产品边界，不一定等于会计报表分部。只有财务披露明确使用同一分部时，才可给财务观测添加相应 segment 维度。

### 4.2 产品族与变体

| product_id | product_type | product_name | family_segment_id | status |
|---:|---|---|---:|---|
| 510001 | humanoid_robot | G1 | 500002 | active |
| 510002 | humanoid_robot | H1 | 500002 | active_or_needs_current_check |
| 510003 | quadruped_robot | Go2 | 500003 | active |
| 510004 | quadruped_robot | B2 | 500003 | active |

| variant_id | product_id | variant_name | target_use | status |
|---:|---:|---|---|---|
| 511001 | 510001 | G1 | standard | active |
| 511002 | 510001 | G1 EDU | research_and_development | active |

产品网页上的每个配置不是新产品族。只有具备独立 SKU、定价、功能边界或生命周期的配置才建立 `product_variant`。

### 4.3 产品规格观测

| observation_id | metric | variant | comparison | value/范围 | unit | as_of_date | 备注 |
|---:|---|---:|---|---|---|---|---|
| 600001 | product.weight_with_battery | 511001 | approx | 35 | kg | 2026-08-12 | 官网显示“约35kg” |
| 600002 | product.joint_motor_count | 511001 | eq | 23 | count | 2026-08-12 | G1 标准版 |
| 600003 | product.joint_motor_count | 511002 | range | 23..43 | count | 2026-08-12 | G1 EDU，依配置变化 |
| 600004 | product.endurance | 511001 | approx | 2 | hour | 2026-08-12 | 使用场景可能影响结果 |
| 600005 | product.list_price_tax_inclusive | 511001 | eq | 85000 | CNY | 2026-08-12 | 网页标价，不代表成交 ASP |

网页同时提示不同配置和场景下参数可能不同，因此每条规格观测保留限定条件，不能将页面值升级成无条件工程性能。

### 4.4 技术与能力

| technology_id | name | type | maturity | information_class |
|---:|---|---|---|---|
| 520001 | 一体化关节集成技术 | hardware_system | mass_production | disclosed_fact |
| 520002 | 机器人激光雷达全自研核心技术 | sensor | mass_production | disclosed_fact |
| 520003 | 高动态运动控制算法技术 | algorithm | mass_production | disclosed_fact |
| 520004 | 通用人形机器人具身大模型 | foundation_model | basic_research | disclosed_fact |

“技术存在及公司披露的阶段”可以是披露事实；“技术领先且形成可持续壁垒”属于分析员判断，必须创建另一个 `research_item` 并关联支持与反对证据。

## 5. 经营指标

### 5.1 指标定义

| metric_code | name | period_type | value_type | default_unit | 定义重点 |
|---|---|---|---|---|---|
| `operating.shipments` | 出货量 | duration | decimal | unit | 必须限定产品范围、是否含轮式双臂及退货口径 |
| `operating.products_on_sale` | 在售产品数 | instant | integer | count | “在售”的判断日期和产品粒度 |
| `market.share` | 市场份额 | duration | decimal | percent | 必须限定市场、地域、计量口径和来源 |

### 5.2 原始观测

| observation_id | metric_code | period | comparison | value | unit | dimensions | source_locator |
|---:|---|---|---|---:|---|---|---|
| 610001 | operating.shipments | 2023-01-01/2025-12-31 | gt | 33000 | unit | product_family=quadruped_robot | 保荐书 P4 |
| 610002 | operating.shipments | 2025-01-01/2025-12-31 | gt | 5500 | unit | product_family=humanoid_robot; excludes=wheeled_dual_arm | 保荐书 P4 |
| 610003 | operating.products_on_sale | 2026-05 | gt | 10 | count | morphology=multiple | 保荐书 P5 |

这些记录展示三个不能丢失的语义：`gt`、期间/时点以及产品定义范围。

## 6. 财务数据

### 6.1 原始披露观测

下表金额单位为人民币万元，均来自保荐书 P6–P7：

| metric_code | 2023 | 2024 | 2025 | period_type | scope |
|---|---:|---:|---:|---|---|
| `cn_gaap.revenue` | 15,913.44 | 39,277.07 | 169,926.93 | duration | consolidated |
| `cn_gaap.net_profit` | -1,114.51 | 9,547.47 | 27,821.05 | duration | consolidated |
| `cn_gaap.net_profit_attributable` | -1,114.51 | 9,547.47 | 27,821.05 | duration | consolidated |
| `cn_gaap.net_operating_cash_flow` | 494.25 | 19,239.13 | 66,998.18 | duration | consolidated |
| `company.main_business_gross_margin` | 44.22% | 56.74% | 60.13% | duration | consolidated |
| `company.r_and_d_to_revenue` | 31.39% | 17.83% | 8.53% | duration | consolidated |

时点数据：

| metric_code | 2023-12-31 | 2024-12-31 | 2025-12-31 | scope |
|---|---:|---:|---:|---|
| `cn_gaap.total_assets`（万元） | 39,127.15 | 152,786.94 | 320,853.83 | consolidated |
| `company.debt_to_asset_ratio` | 23.57% | 16.19% | 18.82% | consolidated |
| `company.debt_to_asset_ratio` | 23.57% | 16.19% | 18.56% | parent_company |

母公司和合并资产负债率在 2025 年不同，因此 `scope` 必须是受控维度，不能放在指标中文名里。

### 6.2 原始值与规范值

以 2025 年营业收入为例：

| observation_id | information_class | decimal_value | unit | lineage |
|---:|---|---:|---|---|
| 620001 | disclosed_fact | 169926.93 | CNY_10K | source document 210001, P7 |
| 620002 | standardized_fact | 1699269300 | CNY | normalized_from 620001, multiplier=10000 |

`620002` 不覆盖 `620001`。模型使用规范值，人工复核回到原始值。

### 6.3 衍生值

如需计算 2023–2025 收入 CAGR，应新建：

```text
information_class = derived_result
formula_version = CAGR_V1
input_observations = [FY2023 revenue, FY2025 revenue]
period_count = 2
```

不能把保荐书披露的 CAGR 与本地重算值混成同一记录。前者是 `disclosed_fact`，后者是 `derived_result`，二者可用于勾稽检查。

## 7. 风险与传导链

### 7.1 风险登记

| risk_id | 风险 | category | likelihood | impact | status |
|---:|---|---|---|---|---|
| 700001 | 增速放缓及经营业绩波动 | operating | 未独立评估 | high | open |
| 700002 | 研发投入方向及成效不及预期 | technology | 未独立评估 | high | open |
| 700003 | 劳务外包用工与质量风险 | operations | 未独立评估 | medium/high | open |
| 700004 | 国际贸易摩擦及管制政策升级 | geopolitical | 未独立评估 | high | open |
| 700005 | 下游大规模商业应用不及预期 | demand | 未独立评估 | high | open |

保荐书列示某风险是披露事实，不等于分析员已经认可其概率评级。`likelihood` 在未评估前保持未知。

### 7.2 贸易风险链

```text
外部因子：关税、出口管制、限制清单
    -> 暴露：报告期各期境外收入占比均超过 40%
    -> 暴露：进口物料约占原材料采购总额 20%
    -> 中间影响：海外售价/销量、采购可得性和采购成本
    -> 财务影响：收入、毛利率、营运资金与研发进度
```

每个箭头保存 `relation_nature`：公司披露的风险传导为 `disclosed_claim`；分析员补充的因果判断为 `analyst_judgment`。

## 8. 预测、估值与投资判断占位

宇树科技已经有历史数据，但本示例不直接生成预测和估值。正确的占位状态是：

| 模块 | status | 原因 | 下一步证据 |
|---|---|---|---|
| 产品 ASP | not_reported | 只有部分网页标价，没有实际平均售价 | 分产品收入与销量、渠道折扣、配置结构 |
| 人形机器人单位成本 | not_reported | 无可靠单位成本披露 | BOM、制造费用、良率、规模效应数据 |
| 2026–2030 销量假设 | not_yet_researched | 尚未建立需求与产能驱动模型 | 订单、产能、交付、下游 ROI |
| DCF | not_ready | 正式假设和自由现金流模型尚未建立 | 经确认的三表预测与资本需求 |
| 相对估值 | not_ready | 可比公司集合和调整规则未批准 | 可比集、估值基准日、增长/利润率调整 |
| 投资 thesis | not_yet_researched | 示例只验证数据模型 | 完整正反证据和估值安全边际 |

这比自动填入行业增长率或新闻估值更符合系统的“明确未知”原则。

## 9. 待解决问题示例

| question_id | priority | question | status | close_condition |
|---:|---|---|---|---|
| 800001 | high | 四足与人形机器人分产品收入、销量和 ASP 是多少？ | open | 获得可核验的分产品数据或形成明确估算方法 |
| 800002 | high | 2025 年扣非净利润显著高于归母净利润的具体原因是什么？ | open | 完成非经常性损益和股份支付等调整桥 |
| 800003 | high | 2026 年一季度扣非净利润同比下降的驱动因素是什么？ | open | 获得季度财务与成本费用拆解 |
| 800004 | medium | G1 从 9.9 万元起变为官网 8.5 万元的生效日期和配置是否可比？ | open | 获取历史网页快照、价格表或正式公告 |
| 800005 | high | 核心零部件自研自产比例与进口物料依赖分别是什么？ | open | 建立 BOM/采购类别和供应来源证据 |
| 800006 | high | 人形机器人商业化需求中展示租赁与真实生产需求各占多少？ | open | 客户、场景、复购、利用率和 ROI 数据 |

问题关闭时必须记录答案、证据、关闭人和关闭理由；“未找到”不能自动等于否定答案。

## 10. 观点节点示例

以下只是展示结构，不代表研究结论：

```text
T1 [disclosed_fact]
公司在 2023–2025 年实现收入快速增长。

T2 [analyst_judgment, unconfirmed]
增长可能由产品竞争力、产品矩阵扩展、行业需求和品牌曝光共同驱动。
depends_on: T1, 产品发布事件, 出货量观测

T3 [counter_thesis, open]
部分需求可能来自短期展示/租赁热度，不能代表可持续生产场景需求。
supports: 保荐书风险提示

T4 [falsification_test]
若核心产品真实终端复购、利用率或单位经济性长期不足，则“规模化商业需求”节点失效。
monitor: 分场景销量、复购率、客户集中度、售后和利用率
```

系统应允许 T2 与 T3 同时存在，不能为了生成一段顺畅摘要而消除分歧。

## 11. 资料定位示例

| item/observation | document_id | locator_type | locator | evidence_role |
|---|---:|---|---|---|
| 当前法定名称 | 210001 | page_line | P3 L37 | supports |
| 有限公司/股份公司成立日 | 210001 | page_line | P3 L42-L43 | supports |
| 2025 人形机器人出货量 > 5,500 | 210001 | page_line | P4 L68-L72 | supports |
| 2023–2025 主要财务数据 | 210001 | table | P6-P7“主要财务数据及指标” | supports |
| 境外收入占比 > 40% | 210001 | page_line | P12 L404-L410 | supports |
| G1 当前网页标价与规格 | 210003 | webpage_section | “Unitree G1 产品参数” | supports |

证据链接中的短摘录只用于定位和复核，不替代原文件。

## 12. 更新规则示例

| 对象 | 触发方式 | 频率/事件 | 新信息到达后的动作 |
|---|---|---|---|
| IPO 状态 | event_driven | 受理、问询、审议、注册、发行、上市 | 每一步新建阶段事件，更新证券/listing 状态，影响估值基准 |
| 监管财务 | event_driven | 新申报稿、年报、季报 | 新建文档版本，提取新观测，执行重述/勾稽检查 |
| 产品网页 | scheduled | 每月或内容哈希变化 | 保存新快照；对规格、标价和在售状态生成差异 |
| 产品新闻 | event_driven | 新品发布/量产/停售 | 新建产品发布事件，检查业务边界与预测假设 |
| thesis | review | 新重大资料或季度复核 | 建立新版本，记录维持/加强/削弱/推翻及原因 |

## 13. 示例采用的一手资料

1. 中信证券关于宇树科技首次公开发行股票并在科创板上市之上市保荐书，上海证券交易所：<https://static.sse.com.cn/stock/disclosure/announcement/c/202605/002178_20260525_X2BM.pdf>
2. 宇树科技公司信息页：<https://www.unitree.com/operate/company/>
3. Unitree G1 产品页：<https://www.unitree.com/cn/g1/>
4. 宇树科技新闻中心：<https://www.unitree.com/cn/news/>
5. 中国证监会《关于同意宇树科技股份有限公司首次公开发行股票注册的批复》：<https://www.csrc.gov.cn/csrc/c105906/c7642867/content.shtml>
6. 上海证券交易所关于宇树科技上市审核进展的公开信息：<https://english.sse.com.cn/news/newsrelease/voice/c/c_20260602_10820540.shtml>

正式入库时必须下载或快照原始资料、计算文件哈希，并复核本文示例中的每一条页码和口径。
