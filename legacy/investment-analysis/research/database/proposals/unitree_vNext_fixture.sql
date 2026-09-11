-- Minimal Unitree fixture for company_research_schema_vNext.sql.
-- DESIGN-ONLY: all IDs and paths are illustrative.

BEGIN;

INSERT INTO entities (entity_id, entity_type, canonical_label, status)
VALUES
    (100000, 'company', '宇树科技', 'active'),
    (100001, 'person', '王兴兴', 'active'),
    (100002, 'organization', '中信证券股份有限公司', 'active'),
    (100003, 'regulator', '上海证券交易所', 'active');

INSERT INTO document_families (
    document_family_id, publisher_name, document_type, canonical_title
)
VALUES
    (100000, '上海证券交易所/中信证券', 'regulatory_filing', '宇树科技上市保荐文件'),
    (100001, '宇树科技', 'product_webpage', 'Unitree G1 产品页'),
    (100002, '中国证券监督管理委员会', 'regulatory_decision', '宇树科技 IPO 注册批复');

INSERT INTO documents (
    document_id, document_family_id, title, language, source_url,
    publication_date, publication_precision, accessed_at
)
VALUES
    (
        100000, 100000,
        '中信证券关于宇树科技首次公开发行股票并在科创板上市之上市保荐书',
        'zh-CN',
        'https://static.sse.com.cn/stock/disclosure/announcement/c/202605/002178_20260525_X2BM.pdf',
        '2026-05', 'month', '2026-08-12'
    ),
    (
        100001, 100001, 'Unitree G1 产品页快照', 'zh-CN',
        'https://www.unitree.com/cn/g1/', NULL, 'unknown', '2026-08-12'
    ),
    (
        100002, 100002, '关于同意宇树科技股份有限公司首次公开发行股票注册的批复',
        'zh-CN', 'https://www.csrc.gov.cn/csrc/c105906/c7642867/content.shtml',
        '2026-07-01', 'day', '2026-08-12'
    );

INSERT INTO document_files (
    document_file_id, document_id, representation, relative_path, sha256, mime_type
)
VALUES
    (
        100000, 100000, 'original',
        '_materials/regulatory/2026/unitree-listing-sponsor-letter.pdf',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'application/pdf'
    ),
    (
        100001, 100001, 'snapshot',
        '_materials/web/unitree-g1/2026-08-12.html',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'text/html'
    ),
    (
        100002, 100002, 'snapshot',
        '_materials/regulatory/2026/csrc-approval-2026-1612.html',
        'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        'text/html'
    );

INSERT INTO research_items (
    item_id, item_type, information_class, topic_code, review_status,
    confidence_level, valid_from, valid_to, date_precision,
    known_from, created_by_type
)
VALUES
    (100000, 'entity_name', 'disclosed_fact', 'company.identity', 'confirmed', 'high', '2016-08-26', '2025-05-27', 'day', '2026-05', 'import'),
    (100001, 'entity_name', 'disclosed_fact', 'company.identity', 'confirmed', 'high', '2025-05-28', NULL, 'day', '2026-05', 'import'),
    (100002, 'entity_identifier', 'disclosed_fact', 'company.identity', 'confirmed', 'high', '2016-08-26', NULL, 'day', '2026-05', 'import'),
    (100003, 'event', 'disclosed_fact', 'company.history', 'confirmed', 'high', '2025-05-28', '2025-05-28', 'day', '2026-05', 'import'),
    (100004, 'technology', 'disclosed_fact', 'business.technology', 'confirmed', 'medium', NULL, NULL, NULL, '2026-05', 'import'),
    (100005, 'event', 'disclosed_fact', 'market.listing', 'confirmed', 'high', '2026-07-01', '2026-07-01', 'day', '2026-07-01', 'import'),
    (100010, 'observation', 'disclosed_fact', 'financials.revenue', 'confirmed', 'high', NULL, NULL, NULL, '2026-05', 'import'),
    (100011, 'observation', 'standardized_fact', 'financials.revenue', 'confirmed', 'high', NULL, NULL, NULL, '2026-05', 'system'),
    (100012, 'observation', 'disclosed_fact', 'operations.shipments', 'confirmed', 'high', NULL, NULL, NULL, '2026-05', 'import'),
    (100013, 'observation', 'disclosed_fact', 'business.product_price', 'needs_review', 'medium', NULL, NULL, NULL, '2026-08-12', 'import'),
    (100020, 'risk', 'disclosed_fact', 'risk.geopolitical', 'confirmed', 'medium', NULL, NULL, NULL, '2026-05', 'import'),
    (100021, 'research_question', 'question', 'business.unit_economics', 'unreviewed', 'unknown', NULL, NULL, NULL, '2026-08-12', 'human'),
    (100022, 'thesis', 'analyst_judgment', 'investment.thesis', 'needs_review', 'low', NULL, NULL, NULL, '2026-08-12', 'human'),
    (100023, 'assumption', 'analyst_assumption', 'forecast.revenue', 'confirmed', 'medium', '2026-01-01', '2026-12-31', 'day', '2026-08-12', 'human'),
    (100024, 'observation', 'derived_result', 'forecast.revenue', 'confirmed', 'medium', NULL, NULL, NULL, '2026-08-12', 'system'),
    (100025, 'observation', 'analyst_assumption', 'forecast.revenue', 'confirmed', 'medium', NULL, NULL, NULL, '2026-08-12', 'human');

INSERT INTO entity_names (item_id, entity_id, name, language, name_type, is_official)
VALUES
    (100000, 100000, '杭州宇树科技有限公司', 'zh-CN', 'legal', 1),
    (100001, 100000, '宇树科技股份有限公司', 'zh-CN', 'legal', 1);

INSERT INTO entity_identifiers (
    item_id, entity_id, identifier_type, identifier_value, jurisdiction
)
VALUES (100002, 100000, 'cn_uscc', '91330108MA27YJ5H56', 'CN');

INSERT INTO events (
    item_id, event_type, title, effective_date, date_precision, event_status
)
VALUES (
    100003, 'legal_form_conversion', '整体变更为股份有限公司',
    '2025-05-28', 'day', 'completed'
), (
    100005, 'ipo_registration_approved', '首次公开发行股票注册获证监会同意',
    '2026-07-01', 'day', 'completed'
);

INSERT INTO event_participants (event_item_id, entity_id, participant_role)
VALUES
    (100003, 100000, 'subject'),
    (100005, 100000, 'issuer');

INSERT INTO business_segments (
    segment_id, parent_segment_id, segment_type, name, definition_status
)
VALUES
    (100000, NULL, 'research_segment', '高性能通用机器人', 'analyst_defined'),
    (100001, 100000, 'product_family', '人形机器人', 'regulatory_reported');

INSERT INTO products (
    product_id, product_type, product_name, family_segment_id, launch_date, status
)
VALUES (100000, 'humanoid_robot', 'G1', 100001, '2024-05-13', 'active');

INSERT INTO product_variants (
    product_variant_id, product_id, variant_name, target_use, status
)
VALUES
    (100000, 100000, 'G1', 'standard', 'active'),
    (100001, 100000, 'G1 EDU', 'research_and_development', 'active');

INSERT INTO technologies (
    item_id, name, technology_type, maturity_stage, description
)
VALUES (
    100004, '高动态运动控制算法技术', 'algorithm', 'mass_production',
    '公司披露已应用于多款足式机器人产品。'
);

INSERT INTO product_technologies (product_id, technology_item_id, relationship_type)
VALUES (100000, 100004, 'uses');

INSERT INTO units (unit_code, unit_name, dimension_type, scale_to_base_text, base_unit_code, currency_code)
VALUES
    ('CNY', '人民币元', 'currency', '1', NULL, 'CNY'),
    ('CNY_10K', '人民币万元', 'currency', '10000', 'CNY', 'CNY'),
    ('unit', '台', 'count', '1', NULL, NULL);

INSERT INTO metric_definitions (
    metric_id, metric_code, canonical_name, metric_category, owner_scope
)
VALUES
    (100000, 'cn_gaap.revenue', '营业收入', 'financial_statement', 'company'),
    (100001, 'operating.shipments', '出货量', 'operating', 'company'),
    (100002, 'product.list_price_tax_inclusive', '含税产品标价', 'product', 'product');

INSERT INTO metric_definition_versions (
    metric_version_id, metric_id, version_number, definition, period_type,
    value_type, default_unit_code, consolidation_rule, valid_from, status
)
VALUES
    (100000, 100000, 1, '按中国企业会计准则披露的营业收入。', 'duration', 'decimal', 'CNY', 'consolidated_or_parent_explicit', '2023-01-01', 'active'),
    (100001, 100001, 1, '指定期间和产品范围内的出货量；必须显式保存排除项。', 'duration', 'decimal', 'unit', NULL, '2023-01-01', 'active'),
    (100002, 100002, 1, '公司产品页面展示的含税标价，不等于实际成交平均售价。', 'instant', 'decimal', 'CNY', NULL, '2024-01-01', 'active');

INSERT INTO dimension_types (dimension_type_id, dimension_code, name, applies_to)
VALUES
    (100000, 'product_family', '产品族', 'observation'),
    (100001, 'product_variant', '产品变体', 'observation');

INSERT INTO dimension_members (
    dimension_member_id, dimension_type_id, member_code, name, segment_id
)
VALUES (100000, 100000, 'humanoid_robot', '人形机器人', 100001);

INSERT INTO dimension_members (
    dimension_member_id, dimension_type_id, member_code, name, product_variant_id
)
VALUES (100001, 100001, 'g1_standard', 'G1', 100000);

INSERT INTO observations (
    item_id, subject_entity_id, metric_id, metric_version_id,
    period_start, period_end, fiscal_period_label, value_kind,
    comparison_operator, raw_value_text, decimal_value_text,
    unit_code, currency_code, data_status, consolidation_scope
)
VALUES
    (100010, 100000, 100000, 100000, '2025-01-01', '2025-12-31', 'FY2025', 'actual', 'eq', '169,926.93 万元', '169926.93', 'CNY_10K', 'CNY', 'reported', 'consolidated'),
    (100011, 100000, 100000, 100000, '2025-01-01', '2025-12-31', 'FY2025', 'actual', 'eq', NULL, '1699269300', 'CNY', 'CNY', 'reported', 'consolidated'),
    (100012, 100000, 100001, 100001, '2025-01-01', '2025-12-31', 'FY2025', 'actual', 'gt', '超过5,500台（纯人形，不含轮式双臂机器人）', '5500', 'unit', NULL, 'reported', 'consolidated');

INSERT INTO observations (
    item_id, subject_entity_id, metric_id, metric_version_id,
    as_of_date, value_kind, comparison_operator, raw_value_text,
    decimal_value_text, unit_code, currency_code, data_status, notes
)
VALUES (
    100013, 100000, 100002, 100002, '2026-08-12', 'actual', 'eq',
    '售价（含税）¥8.5万元', '85000', 'CNY', 'CNY', 'reported',
    '网页标价；准确生效日期尚未确定。'
);

INSERT INTO observation_dimensions (
    observation_item_id, dimension_type_id, dimension_member_id
)
VALUES
    (100012, 100000, 100000),
    (100013, 100001, 100001);

INSERT INTO item_relations (
    source_item_id, target_item_id, relation_type, relation_nature, notes
)
VALUES
    (100011, 100010, 'normalizes', 'system_defined', 'CNY_10K × 10000 = CNY'),
    (100022, 100012, 'depends_on', 'analyst_judgment', '增长判断依赖出货量证据');

INSERT INTO evidence_links (
    evidence_link_id, item_id, document_id, locator_type, locator_value,
    evidence_role, extraction_method, review_status
)
VALUES
    (100000, 100000, 100000, 'page_line', 'P3 L42-L43', 'supports', 'manual', 'confirmed'),
    (100001, 100001, 100000, 'page_line', 'P3 L37-L44', 'supports', 'manual', 'confirmed'),
    (100002, 100003, 100000, 'page_line', 'P3 L42-L43', 'supports', 'manual', 'confirmed'),
    (100003, 100004, 100000, 'page_line', 'P5 L158-L166', 'supports', 'manual', 'confirmed'),
    (100004, 100010, 100000, 'table', 'P6-P7 主要财务数据及指标', 'supports', 'manual', 'confirmed'),
    (100005, 100012, 100000, 'page_line', 'P4 L68-L72', 'supports', 'manual', 'confirmed'),
    (100006, 100013, 100001, 'webpage_section', 'Unitree G1 产品参数/售价（含税）', 'supports', 'manual', 'unreviewed');

INSERT INTO evidence_links (
    evidence_link_id, item_id, document_id, locator_type, locator_value,
    evidence_role, extraction_method, review_status
)
VALUES
    (100007, 100020, 100000, 'page_line', 'P12 L404-L414', 'supports', 'manual', 'confirmed');

INSERT INTO evidence_links (
    evidence_link_id, item_id, document_id, locator_type, locator_value,
    evidence_role, extraction_method, review_status
)
VALUES
    (100008, 100005, 100002, 'section', '证监许可〔2026〕1612号/第一项', 'supports', 'manual', 'confirmed');

INSERT INTO risks (
    item_id, title, risk_category, likelihood, impact_level, risk_status, description
)
VALUES (
    100020, '国际贸易摩擦及管制政策升级', 'geopolitical',
    'unknown', 'high', 'open', '境外销售和进口物料同时存在政策暴露。'
);

INSERT INTO research_questions (
    item_id, question, priority, question_status, close_condition
)
VALUES (
    100021, '四足与人形机器人分产品收入、销量和实际平均售价是多少？',
    'high', 'open', '取得可核验的分产品披露或形成经审核的估算方法。'
);

INSERT INTO theses (
    item_id, thesis_type, title, statement, thesis_status, analyst_owner
)
VALUES (
    100022, 'business', '规模化增长候选判断',
    '产品竞争力和产品矩阵扩展可能共同推动收入增长，但需求持续性仍需验证。',
    'draft', 'example_analyst'
);

INSERT INTO models (model_id, model_type, name, description, status)
VALUES (100000, 'forecast', '宇树三表预测示例', '仅用于验证模型血缘。', 'draft');

INSERT INTO model_versions (
    model_version_id, model_id, version_label, relative_path, sha256, runtime_spec, status
)
VALUES (
    100000, 100000, 'v0-example', '_models/unitree_forecast_v0.xlsx',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'spreadsheet-example', 'draft'
);

INSERT INTO scenarios (scenario_id, name, scenario_type, as_of_date, status, description)
VALUES (100000, '2026 基准情景示例', 'base', '2026-08-12', 'confirmed', '只验证结构，不代表正式预测。');

INSERT INTO observations (
    item_id, subject_entity_id, metric_id, metric_version_id,
    period_start, period_end, fiscal_period_label, value_kind,
    comparison_operator, raw_value_text, decimal_value_text,
    unit_code, currency_code, data_status, consolidation_scope, notes
)
VALUES (
    100024, 100000, 100000, 100000, '2026-01-01', '2026-12-31',
    'FY2026E', 'model_output', 'eq', '示例模型输出', '2500000000',
    'CNY', 'CNY', 'estimated', 'consolidated', '非正式预测。'
);

INSERT INTO observations (
    item_id, subject_entity_id, metric_id, metric_version_id,
    period_start, period_end, fiscal_period_label, value_kind,
    comparison_operator, raw_value_text, decimal_value_text,
    unit_code, currency_code, data_status, consolidation_scope, notes
)
VALUES (
    100025, 100000, 100000, 100000, '2026-01-01', '2026-12-31',
    'FY2026E', 'forecast', 'eq', '经分析员确认的示例收入假设', '2500000000',
    'CNY', 'CNY', 'estimated', 'consolidated', '非正式预测假设。'
);

INSERT INTO assumptions (
    item_id, scenario_id, metric_id, value_observation_item_id,
    statement, rationale, confirmed_by, confirmed_at
)
VALUES (
    100023, 100000, 100000, 100025,
    '2026 年收入采用经人工确认的示例输入。',
    '结构测试，不代表预测。', 'example_analyst', '2026-08-12'
);

INSERT INTO model_runs (
    model_run_id, model_id, model_version_id, scenario_id, data_cutoff_at,
    started_at, completed_at, run_status, environment_fingerprint
)
VALUES (
    100000, 100000, 100000, 100000, '2026-08-12',
    '2026-08-12T12:00:00Z', '2026-08-12T12:00:01Z', 'succeeded', 'fixture'
);

INSERT INTO model_run_items (model_run_id, item_id, item_role)
VALUES
    (100000, 100010, 'input'),
    (100000, 100023, 'assumption'),
    (100000, 100025, 'input'),
    (100000, 100024, 'output');

INSERT INTO coverage_scopes (coverage_scope_id, name, start_date, status)
VALUES (100000, '宇树科技初始建档', '2023-01-01', 'active');

INSERT INTO coverage_requirements (
    coverage_requirement_id, coverage_scope_id, requirement_type,
    requirement_key, required_frequency, materiality, requires_human_review
)
VALUES (
    100000, 100000, 'document_type', 'regulatory_filing',
    'event_driven', 'critical', 1
);

INSERT INTO coverage_results (
    coverage_requirement_id, coverage_status, current_through, checked_at, details
)
VALUES (
    100000, 'partially_covered', '2026-05', '2026-08-12',
    '示例只登记上市保荐书，尚未覆盖全部申报文件。'
);

COMMIT;
