# investment-analysis 迁移执行记录

当前状态见[2026-09-11 文件保留与清理记录](retirement-2026-09-11.md)。以下保留 2026-09-08 的资产盘点，恢复方式已按仅保留最后文件更新。

日期：2026-09-08。源提交：`b57076f3c94e60c070637a29e50d8737acd3ef64`。

## 已完成：保全、文档迁移、身份预览

1. 43 个跟踪文件均已保存；2026-09-11 按用户要求移除旧 Git bundle，仅保留最后文件。
2. 保全 46 个 SQLite 文件，包括 catalog、40 家公司库和历史备份；使用 Backup API，逐库检查版本、表记录数量、integrity_check 和 foreign_key_check，均通过。
3. 保全公司 manifests、GICS 字典和宇树 7 个登记证据文件；证据大小与哈希匹配旧库登记。
4. 保存旧仓库工作文件及本地配置、临时研究输出；共 151 个保全文件约 16.2 MB（不含清单）。全部再次校验哈希通过。
5. 迁入 11 份文档：2 份研究 charter、2 份 BRD、7 份历史设计/试点记录。修复相对链接，记录源和目标哈希。
6. 40 家公司身份预览已完成：兖矿匹配现有工作区，39 家拟新增，未发现匹配歧义；39 家缺明确会计准则，中国联通和宇树缺可直接映射的注册地。没有创建新公司或修改现有公司。

外部档案共 4,881 个文件，逻辑大小 49,457,690,551 字节（约 49.5 GB）；本轮只为其中 94 个文件做内容备份，其余 4,787 个文件仅登记路径、大小和修改时间，**尚无内容备份或哈希保证**。这不是整个 Investment Archive 的完整备份。完整下载/备份范围已向用户征询。

备份位于当前 repo 的 Git 忽略目录：

```text
companies/migration-backups/investment-analysis-20260908/
  repository/
  archive/
  preservation.json
  archive-inventory.json
```

该备份与当前项目在同一台机器上且不进 Git。旧工作目录 57 个非缓存文件已逐字节核验，可删除旧工作目录；外部 Investment Archive 与此恢复包仍需保留。

详细身份预览（含原始名称、证券字段和缺口）位于：

```text
companies/migration-reports/investment-analysis-identity-preview-20260908.json
```

[公司身份预览表](identity-preview.md)列出逐公司的缺口；[拟议公司 ID 对照](company-id-map.json)尚未应用；[文档迁移清单](document-manifest.json)记录每份文件的来源。

本轮验证：TypeScript 检查通过，现有 Node 测试 21/21 通过，新增离线迁移测试 4/4 通过。新增测试覆盖 WAL 数据备份、拒绝覆盖、预览不写源文件、不猜会计准则、交易所/代码匹配及歧义阻断。

## 文档入口

- [研究原则与方法](../../principles/README.md)
- [研究业务需求](../../requirements/README.md)
- [旧设计与试点记录](../../legacy/investment-analysis/README.md)
- [初始迁移评估](assessment-2026-09-08.md)
- [下一步来源候选层提案](candidate-layer-proposal.md)

## 可复现工具

以下命令从当前 repo 根目录运行。备份和预览输出路径必须为不存在的新路径；不会覆盖已完成输出。源仓库及源数据库只读。

```sh
python3 -B scripts/migrations/preserve_investment_analysis.py \
  --repo=/absolute/path/to/investment-analysis \
  --archive='/absolute/path/to/Investment Archive' \
  --destination=companies/migration-backups/a-new-backup

python3 -B scripts/migrations/preview_investment_analysis.py \
  --archive=companies/migration-backups/investment-analysis-20260908/archive \
  --target-root='/absolute/path/to/Equity Research Archive/.conte-staging' \
  --mapping=docs/migrations/investment-analysis/company-id-map.json \
  --output=companies/migration-reports/a-new-preview.json

python3 -B -m unittest discover -s tests/migrations -v
```

恢复最后工作文件（目标必须不存在），不恢复 Git 历史：

```sh
python3 - <<'RESTORE'
from pathlib import Path
from shutil import copytree
copytree(Path('companies/migration-backups/investment-analysis-20260908/repository'),
         Path('/path/to/restored-investment-analysis'))
RESTORE
```

`archive/` 内数据库为独立一致性副本，恢复公司时还须连同对应 manifest 和已备份证据一起恢复。未备份文件仍依赖旧外部档案。

## 下一步与边界

- 待选择宇树接入范围：推荐独立来源候选层，或暂只保留旧数据库附件。
- 从原始披露补充缺失的会计准则/注册地，不按国家猜测准则、不放宽 manifest 校验。
- 后续宇树结构化迁移需保留 47 条观测、67 条证据关系、10 个双来源序列与 9 个冲突；不能依次写入 facts 覆盖来源。
- 实体历史、质量问题及覆盖记录仍是未映射语义，未声称已迁为当前应用功能。
- 没有执行删除、Git commit/push、修改旧目录、写入旧档案或改动当前领域 schema。
