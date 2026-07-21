This is the field mapping to use when ingesting [random_east_west_africa_soil_samples.csv](random_east_west_africa_soil_samples.csv). The values in that CSV were randomly generated and have no real-world meaning — they exist solely to provide sample data for testing the ingestion flow.

Sample mapping:

| Detected columns | Map to | Unit | Sample pretreatment | Extraction ratio | Technique | Extraction base | Laboratory method | Measurement procedure | Extractant concentration | Limit of detection |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| depth | Depth | | | | | | | | | |
| pH | pH | pH | Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm). | 01:05 | Lab procedure | volume / volume | water [H2O] | Glass electrode | | 2-10 |
| SOC_g_kg | Carbon organic | g/kg | sieved over 2 mm sieve | | Lab procedure | | wet oxidation with Sulphuric acid [H2SO4] - Potassiumbichromate [K2Cr2O7] (and Phosphoric acid [H3PO4]) mixture | gravimetric | | |
| TN_g_kg | Nitrogen total | g/kg | Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm). | | Lab procedure | | Modified Kjeldahl method | Kjeldahl digestion unit + distillation apparatus | | 0.2 |
| clay_pct | Clay Fraction | % | sieved over 2 mm sieve | | Calculated | | | field hand estimate | | |
| sand_pct | Sand Fraction | % | | | Spectral | | | MIR | | |
| CEC_cmolc_kg | Cation exchange capacity effective | cmolc/kg | Sample pretreated per ISO 11464:2006 (air-dried, ground, sieved <2 mm). | | | mass / volume | Barium chloride [BaCl2] followed by magnesium sulfate [MgSO4] displacement | Flame emission (AAS) or ICP-OES | 0.1 M | 2 |
