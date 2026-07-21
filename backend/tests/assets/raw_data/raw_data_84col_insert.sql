-- Create required procedure data
CREATE TEMP TABLE _proc_data (
  sample_pretreatment      text,
  technique                text,
  laboratory_method        text,
  extractant_concentration text,
  extraction_ratio         text,
  extraction_base          text,
  measurement_procedure    text,
  limit_of_detection       text
);

INSERT INTO _proc_data VALUES
  (NULL, 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Oostenbrink elutriator', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Cobb', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Whitehead tray', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Elutriator', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Modified Baermann', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Baermann', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Sugar flotation centrifugation', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Cotton-wool filter', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'Seinhorst elutriator', NULL, NULL, NULL, NULL, NULL),
  (NULL, 'lab procedure', 'AZC', NULL, NULL, NULL, NULL, NULL);

-- Insert distinct vocabulary entries per category (triggers handle slug + slug_history)
INSERT INTO vocabulary (name, category)
SELECT DISTINCT sample_pretreatment, 'sample_pretreatment'::vocabulary_category_enum
FROM _proc_data WHERE sample_pretreatment IS NOT NULL;

INSERT INTO vocabulary (name, category)
SELECT DISTINCT laboratory_method, 'laboratory_method'::vocabulary_category_enum
FROM _proc_data WHERE laboratory_method IS NOT NULL;

INSERT INTO vocabulary (name, category)
SELECT DISTINCT extractant_concentration, 'extractant_concentration'::vocabulary_category_enum
FROM _proc_data WHERE extractant_concentration IS NOT NULL;

INSERT INTO vocabulary (name, category)
SELECT DISTINCT extraction_ratio, 'extraction_ratio'::vocabulary_category_enum
FROM _proc_data WHERE extraction_ratio IS NOT NULL;

INSERT INTO vocabulary (name, category)
SELECT DISTINCT extraction_base, 'extraction_base'::vocabulary_category_enum
FROM _proc_data WHERE extraction_base IS NOT NULL;

INSERT INTO vocabulary (name, category)
SELECT DISTINCT measurement_procedure, 'measurement_procedure'::vocabulary_category_enum
FROM _proc_data WHERE measurement_procedure IS NOT NULL;

INSERT INTO vocabulary (name, category)
SELECT DISTINCT limit_of_detection, 'limit_of_detection'::vocabulary_category_enum
FROM _proc_data WHERE limit_of_detection IS NOT NULL;

-- Insert procedures with vocabulary ID lookups
INSERT INTO procedures (technique, sample_pretreatment_id, laboratory_method_id, extractant_concentration_id, extraction_ratio_id, extraction_base_id, measurement_procedure_id, limit_of_detection_id)
SELECT
  p.technique::procedures_technique_enum,
  sp.id,
  lm.id,
  ec.id,
  er.id,
  eb.id,
  mp.id,
  lod.id
FROM _proc_data p
LEFT JOIN vocabulary sp  ON sp.name  = p.sample_pretreatment      AND sp.category  = 'sample_pretreatment'
LEFT JOIN vocabulary lm  ON lm.name  = p.laboratory_method         AND lm.category  = 'laboratory_method'
LEFT JOIN vocabulary ec  ON ec.name  = p.extractant_concentration  AND ec.category  = 'extractant_concentration'
LEFT JOIN vocabulary er  ON er.name  = p.extraction_ratio          AND er.category  = 'extraction_ratio'
LEFT JOIN vocabulary eb  ON eb.name  = p.extraction_base           AND eb.category  = 'extraction_base'
LEFT JOIN vocabulary mp  ON mp.name  = p.measurement_procedure     AND mp.category  = 'measurement_procedure'
LEFT JOIN vocabulary lod ON lod.name = p.limit_of_detection        AND lod.category = 'limit_of_detection'
ON CONFLICT ON CONSTRAINT "UQ_procedures_sample_pretreatment_id_technique_laboratory_method_id_extractant_concentration_id_extraction_ratio_id_extraction_base_id_measurement_procedure_id_limit_of_detection_id" DO NOTHING;

DROP TABLE _proc_data;

-- Create raw table
CREATE TABLE {{table}}
(record_id int4 PRIMARY KEY, nematode_tot_0 float8 NULL, nematode_tot_1 float8 NULL, nematode_tot_2 float8 NULL, nematode_tot_3 float8 NULL, nematode_tot_4 float8 NULL, nematode_tot_5 float8 NULL, nematode_tot_6 float8 NULL, nematode_tot_7 float8 NULL, nematode_tot_8 float8 NULL, nematode_tot_9 float8 NULL, nematode_bact_0 float8 NULL, nematode_bact_1 float8 NULL, nematode_bact_2 float8 NULL, nematode_bact_3 float8 NULL, nematode_bact_4 float8 NULL, nematode_bact_5 float8 NULL, nematode_bact_6 float8 NULL, nematode_bact_7 float8 NULL, nematode_bact_8 float8 NULL, nematode_bact_9 float8 NULL, nematode_fung_0 float8 NULL, nematode_fung_1 float8 NULL, nematode_fung_2 float8 NULL, nematode_fung_3 float8 NULL, nematode_fung_4 float8 NULL, nematode_fung_5 float8 NULL, nematode_fung_6 float8 NULL, nematode_fung_7 float8 NULL, nematode_fung_8 float8 NULL, nematode_fung_9 float8 NULL, nematode_herb_0 float8 NULL, nematode_herb_1 float8 NULL, nematode_herb_2 float8 NULL, nematode_herb_3 float8 NULL, nematode_herb_4 float8 NULL, nematode_herb_5 float8 NULL, nematode_herb_6 float8 NULL, nematode_herb_7 float8 NULL, nematode_herb_8 float8 NULL, nematode_herb_9 float8 NULL, nematode_omni_0 float8 NULL, nematode_omni_1 float8 NULL, nematode_omni_2 float8 NULL, nematode_omni_3 float8 NULL, nematode_omni_4 float8 NULL, nematode_omni_5 float8 NULL, nematode_omni_6 float8 NULL, nematode_omni_7 float8 NULL, nematode_omni_8 float8 NULL, nematode_omni_9 float8 NULL, nematode_pred_0 float8 NULL, nematode_pred_1 float8 NULL, nematode_pred_2 float8 NULL, nematode_pred_3 float8 NULL, nematode_pred_4 float8 NULL, nematode_pred_5 float8 NULL, nematode_pred_6 float8 NULL, nematode_pred_7 float8 NULL, nematode_pred_8 float8 NULL, nematode_pred_9 float8 NULL, nematode_tot_10 float8 NULL, nematode_unid_0 float8 NULL, nematode_unid_1 float8 NULL, nematode_unid_2 float8 NULL, nematode_unid_3 float8 NULL, nematode_unid_4 float8 NULL, nematode_unid_5 float8 NULL, nematode_unid_6 float8 NULL, nematode_unid_7 float8 NULL, nematode_unid_8 float8 NULL, nematode_unid_9 float8 NULL, nematode_bact_10 float8 NULL, nematode_fung_10 float8 NULL, nematode_herb_10 float8 NULL, nematode_omni_10 float8 NULL, nematode_pred_10 float8 NULL, nematode_unid_10 float8 NULL, sampling_depth_lower float8 NULL, sampling_depth_upper float8 NULL, geometry public.geometry(point, 4326) NULL);
 INSERT INTO {{table}}
SELECT p.* FROM 
( VALUES   (1, 3124, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1719, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 21, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 859, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 126, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 21, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 377, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, 10, 0, 'POINT (4.0404599990562069 52.6055712646989093)'::geometry),
  (2, NULL, 7886, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3493, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 106, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2382, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 688, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 371, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 847, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, 10, 0, 'POINT (9.7364261280321571 52.3947756180244610)'::geometry),
  (3, NULL, NULL, 4090, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1745, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 109, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1391, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 136, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 709, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, 10, 0, 'POINT (3.9152356632670480 49.8056660516879219)'::geometry),
  (4, NULL, NULL, NULL, 5787, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2469, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 193, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1890, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 270, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 964, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, 10, 0, 'POINT (7.9610584551958272 48.6983832483200132)'::geometry),
  (5, NULL, NULL, NULL, NULL, 5180, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1623, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 138, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2832, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 414, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 138, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 35, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, 10, 0, 'POINT (9.1224052395938227 53.3037383731016376)'::geometry),
  (6, NULL, NULL, NULL, NULL, NULL, 3933, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1783, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 79, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1311, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 236, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 52, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 472, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 10, 0, 'POINT (6.1460504700103868 52.7697892053039013)'::geometry),
  (7, NULL, NULL, NULL, NULL, NULL, NULL, 5827, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1632, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 233, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2680, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 272, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 78, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 932, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 0, 'POINT (8.7233888101177399 53.0112259742068730)'::geometry),
  (8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 3567, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1522, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 24, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1427, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 285, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 71, NULL, NULL, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 238, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 0, 'POINT (6.5913232404279354 49.1561864427445698)'::geometry),
  (9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 6857, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4049, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 92, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1289, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 92, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 46, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1289, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 0, 'POINT (1.9697028821203011 54.6744208338178268)'::geometry),
  (10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5120, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2597, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 293, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1573, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 183, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 110, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 366, NULL, NULL, NULL, NULL, NULL, NULL, 10, 0, 'POINT (8.4223306446108701 50.9929299574745656)'::geometry))
 AS p(record_id, nematode_tot_0, nematode_tot_1, nematode_tot_2, nematode_tot_3, nematode_tot_4, nematode_tot_5, nematode_tot_6, nematode_tot_7, nematode_tot_8, nematode_tot_9, nematode_bact_0, nematode_bact_1, nematode_bact_2, nematode_bact_3, nematode_bact_4, nematode_bact_5, nematode_bact_6, nematode_bact_7, nematode_bact_8, nematode_bact_9, nematode_fung_0, nematode_fung_1, nematode_fung_2, nematode_fung_3, nematode_fung_4, nematode_fung_5, nematode_fung_6, nematode_fung_7, nematode_fung_8, nematode_fung_9, nematode_herb_0, nematode_herb_1, nematode_herb_2, nematode_herb_3, nematode_herb_4, nematode_herb_5, nematode_herb_6, nematode_herb_7, nematode_herb_8, nematode_herb_9, nematode_omni_0, nematode_omni_1, nematode_omni_2, nematode_omni_3, nematode_omni_4, nematode_omni_5, nematode_omni_6, nematode_omni_7, nematode_omni_8, nematode_omni_9, nematode_pred_0, nematode_pred_1, nematode_pred_2, nematode_pred_3, nematode_pred_4, nematode_pred_5, nematode_pred_6, nematode_pred_7, nematode_pred_8, nematode_pred_9, nematode_tot_10, nematode_unid_0, nematode_unid_1, nematode_unid_2, nematode_unid_3, nematode_unid_4, nematode_unid_5, nematode_unid_6, nematode_unid_7, nematode_unid_8, nematode_unid_9, nematode_bact_10, nematode_fung_10, nematode_herb_10, nematode_omni_10, nematode_pred_10, nematode_unid_10, sampling_depth_lower, sampling_depth_upper, geometry);

-- Create data_mapping and link
WITH ins_dm AS (
INSERT INTO data_mappings (data_mapping, created_by) 
SELECT jsonb_object_agg(a.column_name, a.col_info) || '{"sampling_depth_upper": "min_depth", "sampling_depth_lower": "max_depth"}'::jsonb, 'data-admin' 
 FROM (SELECT '1' as grp, v.column_name, jsonb_build_object('property_id', sp.slug, 'conversion_id', uc.slug, 'procedure_id', proc.slug) as col_info
    FROM ( 
 VALUES 
('Nematode_bact_0','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Oostenbrink elutriator',NULL),
('Nematode_bact_1','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cobb',NULL),
('Nematode_bact_2','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Whitehead tray',NULL),
('Nematode_bact_3','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Elutriator',NULL),
('Nematode_bact_4','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Modified Baermann',NULL),
('Nematode_bact_5','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Baermann',NULL),
('Nematode_bact_6','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Sugar flotation centrifugation',NULL),
('Nematode_bact_7','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cotton-wool filter',NULL),
('Nematode_bact_8','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,NULL,NULL),
('Nematode_bact_9','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Seinhorst elutriator',NULL),
('Nematode_bact_10','nembact','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'AZC',NULL),

('Nematode_fung_0','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Oostenbrink elutriator',NULL),
('Nematode_fung_1','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cobb',NULL),
('Nematode_fung_2','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Whitehead tray',NULL),
('Nematode_fung_3','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Elutriator',NULL),
('Nematode_fung_4','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Modified Baermann',NULL),
('Nematode_fung_5','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Baermann',NULL),
('Nematode_fung_6','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Sugar flotation centrifugation',NULL),
('Nematode_fung_7','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cotton-wool filter',NULL),
('Nematode_fung_8','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,NULL,NULL),
('Nematode_fung_9','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Seinhorst elutriator',NULL),
('Nematode_fung_10','nemfungi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'AZC',NULL),

('Nematode_herb_0','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Oostenbrink elutriator',NULL),
('Nematode_herb_1','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cobb',NULL),
('Nematode_herb_2','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Whitehead tray',NULL),
('Nematode_herb_3','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Elutriator',NULL),
('Nematode_herb_4','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Modified Baermann',NULL),
('Nematode_herb_5','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Baermann',NULL),
('Nematode_herb_6','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Sugar flotation centrifugation',NULL),
('Nematode_herb_7','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cotton-wool filter',NULL),
('Nematode_herb_8','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,NULL,NULL),
('Nematode_herb_9','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Seinhorst elutriator',NULL),
('Nematode_herb_10','nemherbi','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'AZC',NULL),

('Nematode_omni_0','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Oostenbrink elutriator',NULL),
('Nematode_omni_1','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cobb',NULL),
('Nematode_omni_2','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Whitehead tray',NULL),
('Nematode_omni_3','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Elutriator',NULL),
('Nematode_omni_4','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Modified Baermann',NULL),
('Nematode_omni_5','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Baermann',NULL),
('Nematode_omni_6','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Sugar flotation centrifugation',NULL),
('Nematode_omni_7','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cotton-wool filter',NULL),
('Nematode_omni_8','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,NULL,NULL),
('Nematode_omni_9','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Seinhorst elutriator',NULL),
('Nematode_omni_10','nemomni','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'AZC',NULL),

('Nematode_pred_0','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Oostenbrink elutriator',NULL),
('Nematode_pred_1','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cobb',NULL),
('Nematode_pred_2','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Whitehead tray',NULL),
('Nematode_pred_3','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Elutriator',NULL),
('Nematode_pred_4','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Modified Baermann',NULL),
('Nematode_pred_5','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Baermann',NULL),
('Nematode_pred_6','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Sugar flotation centrifugation',NULL),
('Nematode_pred_7','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cotton-wool filter',NULL),
('Nematode_pred_8','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,NULL,NULL),
('Nematode_pred_9','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Seinhorst elutriator',NULL),
('Nematode_pred_10','nempred','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'AZC',NULL),

('Nematode_unid_0','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Oostenbrink elutriator',NULL),
('Nematode_unid_1','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cobb',NULL),
('Nematode_unid_2','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Whitehead tray',NULL),
('Nematode_unid_3','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Elutriator',NULL),
('Nematode_unid_4','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Modified Baermann',NULL),
('Nematode_unid_5','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Baermann',NULL),
('Nematode_unid_6','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Sugar flotation centrifugation',NULL),
('Nematode_unid_7','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cotton-wool filter',NULL),
('Nematode_unid_8','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,NULL,NULL),
('Nematode_unid_9','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Seinhorst elutriator',NULL),
('Nematode_unid_10','nemunidentified','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'AZC',NULL),

('Nematode_tot_0','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Oostenbrink elutriator',NULL),
('Nematode_tot_1','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cobb',NULL),
('Nematode_tot_2','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Whitehead tray',NULL),
('Nematode_tot_3','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Elutriator',NULL),
('Nematode_tot_4','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Modified Baermann',NULL),
('Nematode_tot_5','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Baermann',NULL),
('Nematode_tot_6','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Sugar flotation centrifugation',NULL),
('Nematode_tot_7','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Cotton-wool filter',NULL),
('Nematode_tot_8','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,NULL,NULL),
('Nematode_tot_9','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'Seinhorst elutriator',NULL),
('Nematode_tot_10','nemtot','n/100g',NULL,'lab procedure'::procedures_technique_enum,NULL,NULL,NULL,NULL,'AZC',NULL)) 
AS v(column_name, property_acronym, original_unit, sample_pretreatment, technique, measurement_procedure, extractant_concentration, extraction_ratio, extraction_base, laboratory_method, limit_of_detection)
    LEFT JOIN vocabulary pv1 ON v.sample_pretreatment is not distinct from pv1.name AND pv1.category = 'sample_pretreatment' AND pv1.deleted_at IS NULL
    LEFT JOIN vocabulary pv2 ON v.laboratory_method is not distinct from pv2.name AND pv2.category = 'laboratory_method' AND pv2.deleted_at IS NULL
    LEFT JOIN vocabulary pv3 ON v.extractant_concentration is not distinct from pv3.name AND pv3.category = 'extractant_concentration' AND pv3.deleted_at IS NULL
    LEFT JOIN vocabulary pv4 ON v.extraction_ratio is not distinct from pv4.name AND pv4.category = 'extraction_ratio' AND pv4.deleted_at IS NULL
    LEFT JOIN vocabulary pv5 ON v.extraction_base is not distinct from pv5.name AND pv5.category = 'extraction_base' AND pv5.deleted_at IS NULL
    LEFT JOIN vocabulary pv6 ON v.measurement_procedure is not distinct from pv6.name AND pv6.category = 'measurement_procedure' AND pv6.deleted_at IS NULL
    LEFT JOIN vocabulary pv7 ON v.limit_of_detection is not distinct from pv7.name AND pv7.category = 'limit_of_detection' AND pv7.deleted_at IS NULL
                LEFT JOIN procedures proc
                  on pv1.id is not distinct from proc.sample_pretreatment_id 
                  and v.technique is not distinct from proc.technique
                  and pv2.id is not distinct from proc.laboratory_method_id 
                  and pv3.id is not distinct from proc.extractant_concentration_id 
                  and pv4.id is not distinct from proc.extraction_ratio_id 
                  and pv5.id is not distinct from proc.extraction_base_id 
                  and pv6.id is not distinct from proc.measurement_procedure_id 
                  and pv7.id is not distinct from proc.limit_of_detection_id                 
                left join soil_properties sp
                using (property_acronym)
                left join unit_conversions uc
                on v.original_unit is not distinct from uc.original_unit_of_measurement and sp.id = uc.property_id) a
                group by a.grp
                on conflict(data_mapping_hash) do update set
                updated_at=now()
                  RETURNING *
                )
                INSERT INTO dataset_file_mappings (dataset_id, data_mapping_id, file_id)
                    SELECT d.id, dm.id, f.id
                    from ins_dm dm, files f, datasets d 
where d.id='{{datasetId}}' AND f.id='{{fileId}}'
RETURNING *;