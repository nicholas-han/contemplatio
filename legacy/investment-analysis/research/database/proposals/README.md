# 数据库设计提案

本目录只保存尚未批准的 Schema 和 fixture，不属于正式迁移链。

当前文件：

- `company_research_schema_vNext.sql`：公司研究数据库下一代核心关系草案；
- `unitree_vNext_fixture.sql`：用于验证证据、历史、观测、风险、假设和模型血缘的宇树科技最小样例。

禁止把提案 SQL 直接应用到 Investment Archive 中的正式 `company.sqlite`。正式变更必须：

1. 确认设计文档和业务边界；
2. 分解成从当前 V2 出发的版本化迁移；
3. 使用生产数据库副本进行迁移演练；
4. 创建并验证 SQLite 完整备份；
5. 通过外键、完整性、领域规则和数据对账检查。

本地临时验证命令：

```bash
db=$(mktemp /tmp/company-research-vnext.XXXXXX.sqlite)
sqlite3 "$db" < research/database/schema.sql
sqlite3 "$db" < research/database/proposals/company_research_schema_vNext.sql
sqlite3 "$db" < research/database/proposals/unitree_vNext_fixture.sql
sqlite3 "$db" "PRAGMA foreign_key_check; PRAGMA integrity_check;"
rm "$db"
```

预期 `foreign_key_check` 无输出，`integrity_check` 返回 `ok`。
