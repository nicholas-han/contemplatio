BEGIN IMMEDIATE;

-- V4 adds read-only selection views for source-versioned observations. A
-- recommendation is a query result, not a claim that an earlier source was
-- corrected or superseded.

CREATE VIEW v_observation_candidates AS
WITH dimension_keys AS (
    SELECT
        o.item_id,
        COALESCE(
            (
                SELECT group_concat(pair, '|')
                FROM (
                    SELECT printf(
                        '%d:%d', od.dimension_type_id, od.dimension_member_id
                    ) AS pair
                    FROM observation_dimensions od
                    WHERE od.observation_item_id = o.item_id
                    ORDER BY od.dimension_type_id, od.dimension_member_id
                )
            ),
            ''
        ) AS dimension_key
    FROM observations o
),
base AS (
    SELECT
        o.*,
        m.metric_code,
        m.canonical_name,
        r.information_class,
        r.review_status,
        r.confidence_level,
        r.known_from,
        r.recorded_at,
        d.dimension_key,
        printf(
            'subject=%s|metric=%d|start=%s|end=%s|asof=%s|fiscal=%s|kind=%s|scope=%s|unit=%s|currency=%s|dims=%s',
            COALESCE(CAST(o.subject_entity_id AS TEXT), ''),
            o.metric_id,
            COALESCE(o.period_start, ''),
            COALESCE(o.period_end, ''),
            COALESCE(o.as_of_date, ''),
            COALESCE(o.fiscal_period_label, ''),
            o.value_kind,
            COALESCE(o.consolidation_scope, ''),
            COALESCE(o.unit_code, ''),
            COALESCE(o.currency_code, ''),
            d.dimension_key
        ) AS series_key,
        printf(
            'operator=%s|value=%s|low=%s|high=%s|text=%s|bool=%s|status=%s',
            o.comparison_operator,
            COALESCE(o.decimal_value_text, ''),
            COALESCE(o.decimal_low_text, ''),
            COALESCE(o.decimal_high_text, ''),
            COALESCE(o.text_value, ''),
            COALESCE(CAST(o.boolean_value AS TEXT), ''),
            o.data_status
        ) AS value_signature
    FROM observations o
    JOIN research_items r USING (item_id)
    JOIN metric_definitions m USING (metric_id)
    JOIN dimension_keys d USING (item_id)
),
ranked AS (
    SELECT
        b.*,
        ROW_NUMBER() OVER (
            PARTITION BY b.series_key
            ORDER BY
                CASE b.review_status
                    WHEN 'confirmed' THEN 0
                    WHEN 'needs_review' THEN 1
                    WHEN 'unreviewed' THEN 2
                    WHEN 'superseded' THEN 3
                    WHEN 'rejected' THEN 4
                    ELSE 5
                END,
                CASE b.information_class
                    WHEN 'disclosed_fact' THEN 0
                    WHEN 'management_guidance' THEN 1
                    WHEN 'standardized_fact' THEN 2
                    WHEN 'derived_result' THEN 3
                    ELSE 4
                END,
                COALESCE(b.known_from, '') DESC,
                b.recorded_at DESC,
                b.item_id DESC
        ) AS recommendation_rank,
        COUNT(*) OVER (PARTITION BY b.series_key) AS candidate_count,
        MIN(b.value_signature) OVER (PARTITION BY b.series_key)
            AS minimum_value_signature,
        MAX(b.value_signature) OVER (PARTITION BY b.series_key)
            AS maximum_value_signature
    FROM base b
)
SELECT
    ranked.*,
    CASE
        WHEN minimum_value_signature <> maximum_value_signature THEN 1
        ELSE 0
    END AS has_value_conflict,
    CASE
        WHEN recommendation_rank = 1
             AND minimum_value_signature <> maximum_value_signature
            THEN 'default_needs_review'
        WHEN recommendation_rank = 1 THEN 'default'
        ELSE 'candidate'
    END AS recommendation_status,
    'review_status_then_information_class_then_known_from' AS recommendation_method
FROM ranked;

CREATE VIEW v_observation_current AS
SELECT *
FROM v_observation_candidates
WHERE recommendation_rank = 1;

PRAGMA user_version = 4;
COMMIT;
