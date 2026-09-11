# 公司级研究数据库

`catalog.sqlite` 只保存跨公司定位所需的最小索引；每家公司目录内的
`company.sqlite` 保存该公司的名称、实体、证据和研究数据。

## 当前版本边界

| Schema | 使用范围 | 内容 |
|---|---|---|
| V2 | 除宇树科技外的现有公司 | `company_names`、`securities` |
| V3 Phase A | 历史迁移层 | 证据、实体、统一指标定义、观测值、覆盖与质量问题 |
| V4 | 仅宇树科技试点 | V3 全部内容，加多来源观测候选与默认推荐只读视图 |

V4 没有新增权威事实表，也不包含业务模型、风险模型、预测、估值或 thesis。
其他公司不会因为验证工具支持 V4 而自动迁移；只有显式执行
`migrate <公司目录>` 才会迁移目标公司。

`company.json` 在 V3 及以后是入口清单，不再重复保存成立日期、地址和网站等
可变事实：

```json
{
  "version": 3,
  "company_id": 100039,
  "database": "company.sqlite",
  "research_subject_entity_id": 100000
}
```

## 迁移与校验

```bash
python3 research/database/company_database.py migrate 宇树科技
python3 research/database/company_database.py validate 宇树科技
python3 research/catalog/catalog.py validate
```

迁移前会通过 SQLite Backup API 在公司目录创建完整备份。V3/V4 校验包括：

- Schema 版本、严格表/视图集合、外键与 `integrity_check`；
- 恰好一个研究主体，并连接 catalog 的稳定 `company_id`；
- 扩展表与 `research_items.item_type` 一致；
- 已确认的一手披露事实必须有已确认的支持性证据；
- 所有登记文件必须存在，且字节数和 SHA-256 与数据库一致。

V4 的 `v_observation_candidates` 将同一主体、指标、期间、数值类型、口径、
单位、币种和维度的观测归为一个序列，并依次按复核状态、信息类别、`known_from`
和入库时间给出推荐顺序。`v_observation_current` 只暴露每组第一候选。它们都是
可重建的查询结果，不会覆盖旧记录，也不表示较早来源已被正式更正或取代；同组
数值不一致时，第一候选会标为 `default_needs_review`。

## 宇树 Phase A 与 V4 试验可复现入口

```bash
python3 research/database/add_companies.py \
  research/database/manifests/unitree.json
python3 research/database/company_database.py migrate 宇树科技
python3 research/database/seed_unitree_phase_a.py
python3 research/database/seed_unitree_2024_version_pilot.py
```

`seed_unitree_phase_a.py` 要求一手材料已经放到脚本声明的相对路径。脚本在
写入前验证每个文件的 SHA-256，并在单个事务内完成写入；重复执行会根据覆盖
范围标记安全退出。

第二个种子脚本保留招股说明书和上市保荐书披露的两套 FY2024 主要财务指标，
用于验证来源版本共存和默认推荐逻辑。结果及边界见
[宇树科技 FY2024 多来源版本试验](../../../../docs/legacy/investment-analysis/design/unitree-2024-version-pilot.md)。

## 回归验证

从仓库根目录执行：

```bash
python3 -m unittest -v research.database.test_company_database
python3 research/catalog/catalog.py validate
python3 research/database/company_database.py validate 宇树科技
```

当前回归测试共 5 项，覆盖 V2 数据迁移保留、扩展表类型约束、证据文件哈希、
已确认事实的证据要求，以及 V4 多来源观测推荐。

## 查看数据

```bash
sqlite3 -header -column \
  "/path/to/Investment Archive/宇树科技/company.sqlite" \
  "SELECT metric_code, fiscal_period_label, decimal_value_text, unit_code,
          candidate_count, has_value_conflict, recommendation_status
   FROM v_observation_current ORDER BY metric_code, period_end;"
```

旧 `_research/imports` 属于历史导入样本，不使用旧构建命令覆盖正式数据库。
