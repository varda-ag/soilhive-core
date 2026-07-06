## Unit Conversion Reference

The Conversion Rules Registry is the component of SoilHive that determines, for every soil property and original unit encountered during upload, which mathematical transformation is needed to express the reported value in SoilHive's standard unit. It acts as a lookup registry: each supported unit is linked to a specific rule describing how to move from the original measurement to the harmonised one. This is what makes the automatic conversion step described in [Field Mapping](data-management-portal.md) possible — once a property and its original unit are mapped, the registry already holds the formula that applies.

### Design Principles

Standardising units is as important as standardising vocabulary. The SoilHive unit conversion framework was built to make this process transparent, reproducible, and as automatic as possible.

### Conversion Rule Types

All conversion rules are classified into three types:

**IDENTITY**

The original unit is numerically identical to the standard unit — no arithmetic required.

- Formula: `x` (returned as-is)
- Factor: `1`
- Examples: `ppm = mg/kg`, `meq/100g = cmolc/kg`

**SIMPLE**

Multiply the original value by a fixed numeric factor to obtain the standard value.

- Formula: `x × factor`
- Examples: `g/kg × 1000 = mg/kg`; `% × 10 = g/kg`

**CONDITIONAL**

Conversion requires one or more additional site or sample parameters beyond the measured value. The platform prompts the user to supply these before computing the result.

- Examples: `mg/L → mg/kg` requires bulk density; organic carbon stock requires bulk density, sampling depth, and coarse fragment content.

> **Current limitation:** Conditional conversions (those requiring additional parameters such as bulk density or sampling depth) are not yet executed automatically by the platform. The conversion rules are recorded and will be applied in a future release. Users are advised to convert conditional units manually before upload where possible.

See [Conversion Rules Table](conversion-rules-table.md) for the full conversion rules table.
