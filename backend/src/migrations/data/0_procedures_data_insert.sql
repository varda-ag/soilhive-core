INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    (NULL, 'lab procedure', 'Mehlich 3', NULL, '01:10', 'mass / mass', NULL, NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, 'mass / mass', NULL, NULL),
    (NULL, 'lab procedure', 'Dry oxidation', NULL, NULL, 'mass / mass', NULL, NULL),
    (NULL, 'lab procedure', 'water [H2O]', NULL, '01:10', 'mass / mass', NULL, NULL),
    (NULL, 'spectral', 'MIR', NULL, NULL, NULL, 'MIR', NULL),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Ammonium acetate [NH4-acetate]', '1 M', '01:10', 'mass / volume', 'Flame emission (AAS) or ICP-OES', '10'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Barium chloride [BaCl2] followed by magnesium sulfate [MgSO4] displacement', '0.1 M', NULL, 'mass / volume', 'Flame emission (AAS) or ICP-OES', '2'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).carbonate removal with HCl', 'lab procedure', 'Dry combustion', NULL, NULL, 'mass / mass', 'Elemental analyzer or combustion apparatus with CO2 detection (IR, GC, titrimetry,conductometry, or gravimetry conductometry, or gravimetry)', '2'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Calcium chloride [CaCl2]', NULL, '01:05', 'volume / volume', 'Glass electrode', '2-10'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'water [H2O]', NULL, '01:05', 'volume / volume', 'Glass electrode', '2-10'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Sodium hydrogen carbonate [NaHCO3]', '0.5 M', '01:20', 'mass / volume', 'UV-Vis spectrophotometer (molybdenum blue method)', '10'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Sodium hydrogen carbonate [NaHCO3]', '0.5 M', '01:20', 'mass / volume', 'UV-Vis spectrophotometer (molybdenum blue method)', '10000'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', NULL, NULL, NULL, NULL, 'gravimetric', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Gravimetric', NULL),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Sodium hydrogen carbonate [NaHCO3]', '0.5 M', '01:20', 'mass / volume', 'UV-Vis spectrophotometer (molybdenum blue method)', '0.2'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Hydrochloric acid [HCl]', '4 M', NULL, NULL, 'Scheibler apparatus (volumetric CO2 measurement)', '1'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'acid digestion Hydrochloric acid [HCl] Nitric acid [HNO3]', NULL, NULL, NULL, NULL, NULL),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', NULL, NULL, NULL, NULL, 'Laser diffraction', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'water [H2O]', NULL, '01:05', NULL, 'Metal electrode', '10'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Modified Kjeldahl method', NULL, NULL, NULL, 'Kjeldahl digestion unit + distillation apparatus', '0.2'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', 'Acid ammonium oxalate solution', NULL, NULL, 'mass / volume', 'Atomic Absorption Spectrometry (AAS)', '20'),
    ('Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm).', 'lab procedure', NULL, NULL, NULL, 'mass / mass', 'gravimetric', NULL),
    (NULL, 'lab procedure', NULL, NULL, '01:10', 'mass / mass', NULL, NULL),
    (NULL, 'lab procedure', 'water [H2O]', NULL, '01:20', 'mass / volume', NULL, NULL),
    (NULL, 'lab procedure', 'Mehlich 3', NULL, NULL, NULL, NULL, NULL),
    (NULL, 'lab procedure', 'Olsen', NULL, NULL, NULL, NULL, NULL),
    (NULL, 'lab procedure', 'Dry combustion', NULL, NULL, NULL, NULL, NULL),
    ('equilibrated at 33 kPa', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('air dry', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('field moist', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('oven dry (at 105-110 degrees)', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 7', 'lab procedure', 'Ammonium acetate [NH4-acetate]', '1 M', NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 7', 'lab procedure', 'Calcium chloride [CaCl2]', '0.1 M', NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 7', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 7', 'lab procedure', 'Ammonium Chloride [NH4Cl]', '1 M', NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 7', 'lab procedure', 'Calcium Acetate [Ca-acetate]', NULL, NULL, NULL, NULL, NULL),
    ('buffered at 7', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 8', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('sieved over 2 mm sieve and buffered at 8', 'calculated', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 8', 'lab procedure', 'Barium Chloride [BaCl2]', '0.5 M', NULL, NULL, NULL, NULL),
    ('buffered at 8', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 8', 'lab procedure', 'Ammonium acetate [NH4-acetate]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 8', 'lab procedure', 'Calcium Acetate [Ca-acetate]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 8', 'lab procedure', 'Barium Chloride [BaCl2]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 8', 'lab procedure', 'Barium Chloride [BaCl2]', '0.1 M', NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and buffered at 8', 'lab procedure', 'Barium Acetate', NULL, NULL, NULL, NULL, NULL),
    (NULL, 'calculated', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'hydrometer', NULL),
    ('sieved over 2 mm sieve', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'pipette', NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2] plus Hydrochloric acid [HCl] or Acetic acid [CH3COOH] (if pH-H2O >6.5)', 'lab procedure', 'Sodium hexametaphosphate [(NaPO3)6]', NULL, NULL, NULL, 'pipette', NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2] plus Hydrochloric acid [HCl] or Acetic acid [CH3COOH] (if pH-H2O >6.5)', 'lab procedure', 'Sodium hexametaphosphate [(NaPO3)6]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2] plus Hydrochloric acid [HCl] or Acetic acid [CH3COOH] (if pH-H2O >6.5)', 'lab procedure', NULL, NULL, NULL, NULL, 'pipette', NULL),
    ('sieved over 2 mm sieve', 'calculated', NULL, NULL, NULL, NULL, 'field hand estimate', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'analyzer', NULL),
    ('sieved over 1 mm sieve', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 1 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'pipette', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Sodium hydroxide [NaOH]', NULL, NULL, NULL, 'pipette', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('sieved over 2 mm sieve', 'lab procedure', 'Ammonium hydroxide [NH4OH]', NULL, NULL, NULL, 'pipette', NULL),
    ('sieved over 1 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'hydrometer', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Sodium hexametaphosphate [(NaPO3)6]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and field pH', 'calculated', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve and field pH', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:02', NULL, 'electrode', NULL),
    (NULL, 'lab procedure', 'water [H2O]', NULL, '01:02', NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:02.5', NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:02.5', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:05', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:05', NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, 'saturated paste', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, 'saturated paste', NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Kjeldahl', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 1 mm sieve', 'lab procedure', 'Kjeldahl', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Dry oxidation', NULL, NULL, NULL, 'element analyzer', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'wet oxidation with Sulphuric acid [H2SO4] - Potassiumbichromate [K2Cr2O7] (and Phosphoric acid [H3PO4]) mixture', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'wet oxidation with Sulphuric acid [H2SO4] - Potassiumbichromate [K2Cr2O7] (and Phosphoric acid [H3PO4]) mixture', NULL, NULL, NULL, 'titrimetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Dry oxidation', NULL, NULL, NULL, 'loss on ignition', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('sieved over 2 mm sieve', 'lab procedure', 'wet oxidation with Sulphuric acid [H2SO4] - Potassiumbichromate [K2Cr2O7] (and Phosphoric acid [H3PO4]) mixture', NULL, NULL, NULL, 'colorimetry', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'element analyzer', NULL),
    ('sieved over 1 mm sieve', 'lab procedure', 'wet oxidation with Sulphuric acid [H2SO4] - Potassiumbichromate [K2Cr2O7] (and Phosphoric acid [H3PO4]) mixture', NULL, NULL, NULL, 'titrimetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'wet oxidation with Sulphuric acid [H2SO4] - Potassiumbichromate [K2Cr2O7] (and Phosphoric acid [H3PO4]) mixture', NULL, NULL, NULL, 'volumetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'loss on ignition', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'wet oxidation with Sulphuric acid [H2SO4] - Potassiumbichromate [K2Cr2O7] (and Phosphoric acid [H3PO4]) mixture', NULL, NULL, NULL, 'gravimetric', NULL),
    (NULL, 'lab procedure', 'Dry oxidation', NULL, NULL, NULL, 'loss on ignition', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, NULL, NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '00:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:05', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '00:01', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:10', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:01', 'mass / volume', 'electrode', NULL),
    ('sieved over 1 mm sieve', 'lab procedure', 'water [H2O]', NULL, NULL, NULL, 'electrode', NULL),
    ('sieved over 1 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:05', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'spectral', 'water [H2O]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'water [H2O]', NULL, '01:05', 'volume / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:05', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '1 M', '00:01', NULL, 'electrode', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '00:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', NULL, NULL, NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:05', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '1 M', '01:05', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', NULL, NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:02', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.2 M', '01:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.02 M', '01:05', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', NULL, '01:02', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:02', 'volume / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:02', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.1 M', '00:01', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:05', 'volume / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', NULL, '01:10', NULL, 'electrode', NULL),
    (NULL, 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:02', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '01:50', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '0.01 M', '00:01', 'volume / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', '1 M', '01:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', NULL, '01:02', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Calcium chloride [CaCl2]', NULL, '00:01', NULL, 'electrode', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    (NULL, 'lab procedure', 'Bray 1', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Bray 1', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Olsen', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, NULL, NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', '01:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '01:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', '00:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '00:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', '01:25', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', '01:20', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '01:02', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', '01:10', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '0.01 M', '01:05', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', '01:01', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '01:01', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '00:01', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', '01:05', 'mass / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '00:01', 'volume / volume', 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '0.01 M', '01:02', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '1 M', NULL, NULL, 'electrode', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', '0.2 M', '00:01', NULL, 'electrode', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '01:05', NULL, 'electrode', NULL),
    ('sieved over 1 mm sieve', 'lab procedure', 'Potassium chloride [KCl]', NULL, '01:05', NULL, 'electrode', NULL),
    (NULL, 'lab procedure', 'Sodium fluoride [NaF]', NULL, '01:50', NULL, 'electrode', NULL),
    (NULL, 'lab procedure', 'Sodium fluoride [NaF]', NULL, NULL, NULL, 'electrode', NULL),
    (NULL, 'lab procedure', 'Sodium fluoride [NaF]', '1 M', '01:50', NULL, 'electrode', NULL),
    (NULL, 'lab procedure', 'New Zealand', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'New Zealand', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'aqua regia and sulphuric acid/nitric acid', NULL, NULL, NULL, NULL, NULL),
    (NULL, 'lab procedure', 'aqua regia and sulphuric acid/nitric acid', NULL, NULL, NULL, NULL, NULL),
    (NULL, 'lab procedure', 'water [H2O]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2] plus Hydrochloric acid [HCl] or Acetic acid [CH3COOH] (if pH-H2O >6.5)', 'lab procedure', 'Sodium hexametaphosphate [(NaPO3)6]', NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Sodium hexametaphosphate [(NaPO3)6]', NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2] plus Hydrochloric acid [HCl] or Acetic acid [CH3COOH] (if pH-H2O >6.5)', 'lab procedure', NULL, NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2]', 'lab procedure', 'Sodium hexametaphosphate [(NaPO3)6]', NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 1 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Sodium hydroxide [NaOH]', NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Ammonium hydroxide [NH4OH]', NULL, NULL, NULL, 'sieve', NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2] plus Hydrochloric acid [HCl] or Acetic acid [CH3COOH] (if pH-H2O >6.5)', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2] plus Hydrochloric acid [HCl] or Acetic acid [CH3COOH] (if pH-H2O >6.5)', 'lab procedure', NULL, NULL, NULL, NULL, 'hydrometer', NULL),
    ('sieved over 2 mm', 'lab procedure', 'Ammonium hydroxide [NH4OH]', NULL, NULL, NULL, 'pipette', NULL),
    ('sieved over 2mm sieve and Hydrogen peroxide [H2O2]', 'lab procedure', NULL, NULL, NULL, NULL, 'pipette', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Hydrochloric acid [HCl], or Perchloric acid [HClO4]', NULL, NULL, NULL, 'volumetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Hydrochloric acid [HCl], or Perchloric acid [HClO4]', NULL, NULL, NULL, 'titrimetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Hydrochloric acid [HCl], or Perchloric acid [HClO4]', NULL, NULL, NULL, 'gravimetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Hydrochloric acid [HCl], or Perchloric acid [HClO4]', NULL, NULL, NULL, '0', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Sulphuric acid [H2SO4]', NULL, NULL, NULL, 'titrimetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, 'volumetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Hydrochloric acid [HCl], or Perchloric acid [HClO4]', NULL, NULL, NULL, 'pressure', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Hydrochloric acid [HCl], or Perchloric acid [HClO4]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 1 mm sieve', 'lab procedure', NULL, NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Phosphoric acid [H3PO4]', NULL, NULL, NULL, 'titrimetric', NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'dissolution of Carbonates by Acetic acid [CH3COOH]', NULL, NULL, NULL, NULL, NULL),
    ('sieved over 2 mm sieve', 'lab procedure', 'Dry combustion', NULL, NULL, NULL, 'element analyzer', NULL),
    (NULL, 'lab procedure', 'Dry combustion', NULL, NULL, NULL, 'element analyzer', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=6, cm water head=61.3, bar=0.06, pF=1.8', NULL),
    ('air dry, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=10, cm water head=102.2, bar=0.10, pF=2.0', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=10, cm water head=102.2, bar=0.10, pF=2.0', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=33, cm water head=337.1, bar=0.33, pF=2.5', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;
INSERT INTO procedures (
    sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection
) VALUES
    ('air dry, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=100, cm water head=1021.6, bar=1.00, pF=3.0', NULL),
    ('field moist condition, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=100, cm water head=1021.6, bar=1.00, pF=3.0', NULL),
    ('air dry, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=200, cm water head=2043.2, bar=2.00, pF=3.3', NULL),
    ('field moist condition, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=200, cm water head=2043.2, bar=2.00, pF=3.3', NULL),
    ('air dry, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=500, pF 3.7', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=1500, cm water head=15324.0, bar=15.00, pF=4.2', NULL),
    ('air dry, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=1500, cm water head=15324.0, bar=15.00, pF=4.2', NULL),
    ('field moist condition, then saturated', 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=1500, cm water head=15324.0, bar=15.00, pF=4.2', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=100, cm water head=1021.6, bar=1.00, pF=3.0', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'kPa=500, pF 3.7', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Oostenbrik elutriator', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Cobb', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Whitehead tray', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Elutriator', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Modified Baermann', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Baermann', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Sugar flotation centrifugation', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Cotton-wool filter', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'Seinhorst elutriator', NULL),
    (NULL, 'lab procedure', NULL, NULL, NULL, NULL, 'AZC', NULL)
 on conflict(sample_pretreatment, technique, laboratory_method, extractant_concentration, extraction_ratio, extraction_base, measurement_procedure, limit_of_detection) do nothing;