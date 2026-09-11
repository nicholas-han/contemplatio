> 历史参考：迁自 investment-analysis（b57076f，2026-09-08）。本文描述旧架构或历史试点，不替代当前架构规范，文中状态与数据截止日期保持原样。

# 宇树科技 FY2024 多来源版本试验

状态：已完成\
实施日期：2026-08-13\
数据库版本：V4

## 1. 目的与边界

Phase A 首批数据发现，2026-03-20 招股说明书申报稿与 2026-05-25 上市
保荐书对 FY2024 主要财务指标存在差异。本试验验证以下最小闭环：

- 同一指标和期间的多份一手披露分别入库，不覆盖较早版本；
- 每个候选值都保留自己的 `research_item`、`known_from` 和证据定位；
- 查询层可以给出稳定的默认候选，同时明确显示冲突；
- 默认候选只是查询建议，不自动产生“更正”“取代”或“唯一真值”的结论。

本试验没有判断两份材料的差异属于会计差错更正、口径变化还是文件版本差异，
也没有扩展到完整三表、分产品数据、预测或估值。

## 2. V4 查询层

V4 沿用 V3 的全部权威表，只新增两个只读视图：

| 视图 | 用途 |
|---|---|
| `v_observation_candidates` | 展示每个同口径序列的全部来源候选、推荐顺序和冲突标记 |
| `v_observation_current` | 展示每个序列 `recommendation_rank = 1` 的默认候选 |

一个序列由主体、指标、期间/时点、财务期间标签、数值类型、合并口径、单位、
币种和维度共同确定。候选依次按以下字段排序：

1. `review_status`：已确认优先于待复核、未复核、已取代和已拒绝；
2. `information_class`：披露事实优先于管理层指引、标准化事实和衍生结果；
3. `known_from`：前两项相同时，较晚公开的来源优先；
4. `recorded_at` 和 `item_id`：用于稳定处理同日或同批记录。

因此，较新的未复核记录不会仅凭日期盖过已确认记录。若同组候选的数值、
比较符或数据状态不同，`has_value_conflict = 1`，默认候选状态为
`default_needs_review`。

## 3. 入库结果

招股说明书物理第 28 页（印刷第 27 页）的 10 个 FY2024 指标作为较早候选
写入；上市保荐书中的对应记录保持不变。

| 结果 | 数量 |
|---|---:|
| 同口径序列 | 10 |
| 来源候选 | 20 |
| 数值不同的序列 | 9 |
| 数值一致的序列 | 1 |
| 默认候选来自 2026-05-25 上市保荐书 | 10 |
| 新增观测值 | 10 |
| 新增证据链接 | 10 |

试验后宇树公司库共有 47 条观测值和 67 条证据链接。两份来源之间使用
`contradicts` 或 `context_for` 关系连接；原有质量问题也连接到全部 20 个候选，
并保持开放状态。

## 4. 可复现入口

在 Phase A 已完成且公司库已迁移到 V4 后执行：

```bash
python3 research/database/seed_unitree_2024_version_pilot.py
python3 research/database/company_database.py validate 宇树科技
```

种子脚本在单个事务内写入，以覆盖范围名称作为幂等标记。再次运行会验证公司库
后安全退出，不会重复插入候选。

推荐视图可用以下查询复核：

```sql
SELECT
    metric_code,
    fiscal_period_label,
    known_from,
    decimal_value_text,
    candidate_count,
    has_value_conflict,
    recommendation_status
FROM v_observation_current
WHERE fiscal_period_label = 'FY2024'
  AND candidate_count > 1
ORDER BY metric_code;
```

## 5. 验证结果

- `PRAGMA foreign_key_check`：无错误；
- `PRAGMA integrity_check`：`ok`；
- 宇树 V4 公司库校验：通过；
- catalog 全库校验：通过；
- 回归测试：5/5 通过；
- 10 个双来源序列均推荐 `known_from = 2026-05-25` 的候选；
- 9 个冲突序列标为 `default_needs_review`，1 个一致序列标为 `default`；
- 重复执行种子脚本：安全识别已完成批次。

## 6. 后续工作

1. 取得与两版申报材料对应的审计报告或正式更正说明，再决定是否建立
   `supersedes` 关系；
2. 将同样的来源版本策略扩展到 2022–2025 完整三表，而不是只保存摘要指标；
3. 为人工选定候选设计显式决策记录；当前 V4 视图只表达默认查询规则；
4. 在出现不同单位或指标定义版本时，先标准化并保留转换血缘，不将它们误归为
   同一原始披露序列。
