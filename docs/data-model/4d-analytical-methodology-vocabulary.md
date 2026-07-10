## Analytical Methodology Vocabulary

When mapping a soil property during [Field Mapping](1-data-management-portal.md#field-mapping--match-your-data), you can optionally record how the reported value was produced by expanding the methodology panel. To keep this information consistent and comparable across datasets, most of these fields are populated by selecting a term from a controlled vocabulary rather than typing free text. This is the vocabulary referenced in the [Data Model](4a-soil-data-model.md#physical-data-model) as the table that stores classified analytical methodology concepts used to populate the procedures table.

### Columns

| Column | Description |
|---|---|
| `id` | Unique internal identifier (UUID) for the vocabulary entry. |
| `slug` | URL-friendly, human-readable identifier derived from the entry's name. |
| `category` | Which analytical methodology field this term belongs to. See below for the list of categories. |
| `name` | The display value shown to users when selecting this term while mapping a property. |

### Categories

Each entry belongs to one of the following categories, corresponding to the methodology fields described in [Field Mapping](1-data-management-portal.md#field-mapping--match-your-data):

- **`sample_pretreatment`** — physical or chemical preparation applied before analysis
- **`laboratory_method`** — the named protocol or analytical method used
- **`extractant_concentration`** — concentration of the extraction solution
- **`extraction_ratio`** — soil-to-solution ratio used during extraction
- **`extraction_base`** — basis of the extraction ratio (mass/mass, mass/volume, or volume/volume)
- **`measurement_procedure`** — instrument or procedure used to determine the value
- **`limit_of_detection`** — the lowest concentration reliably distinguishable from zero, for the method used

Note: **Technique** (Lab procedure, Spectral, or Calculated) is not part of this controlled vocabulary — it's a fixed set of three options selected directly in the interface, rather than a term looked up from this table:

- **Lab procedure** — the value was measured using a laboratory analytical protocol (physical or chemical analysis).
- **Spectral** — the value was derived from NIR or MIR spectroscopy using calibration models.
- **Calculated** — the value was computed from other variables using formulas, statistical models, or process-based models.

See [Analytical Methodology Table](4e-analytical-methodology-table.csv) for the full vocabulary table.
